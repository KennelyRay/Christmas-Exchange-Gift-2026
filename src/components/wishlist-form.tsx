"use client";

import { ArrowDownIcon, ArrowUpIcon, CameraIcon, PlusIcon, SealCheckIcon, TrashIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ClientApiError, errorMessage } from "@/lib/client-api";
import { compressImage, MAX_SOURCE_BYTES } from "@/lib/images";
import { formatPeso, parsePesoToCentavos } from "@/lib/money";
import { normalizeWebUrl } from "@/lib/stores";
import { MAX_ITEMS, wishlistSubmissionSchema } from "@/lib/validation";
import { SecretCode } from "./secret-code";
import { StoreChip } from "./store-chip";
import { Button, Dialog, ErrorNote, Field, inputClass, Paper } from "./ui";

type Draft = { key: string; name: string; price: string; url: string; imageUrl: string | null };

type Props = { slug: string; budgetCentavos: number | null };

const newItem = (): Draft => ({ key: crypto.randomUUID(), name: "", price: "", url: "", imageUrl: null });

type SavedDraft = { name: string; items: Draft[] };

function loadDraft(storageKey: string): SavedDraft {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as SavedDraft | null;
    if (saved && Array.isArray(saved.items) && saved.items.length > 0) return saved;
  } catch {
    // A missing or unreadable draft just means starting fresh.
  }
  return { name: "", items: [newItem()] };
}

function PhotoPicker({
  slug,
  imageUrl,
  onChange,
  itemLabel,
}: {
  slug: string;
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  itemLabel: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.size > MAX_SOURCE_BYTES) {
      setError("That photo is over 15 MB. Please choose a smaller one.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", await compressImage(file), "photo");
      const { url } = await api<{ url: string }>(`/api/exchanges/${slug}/uploads`, { form });
      onChange(url);
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "We couldn't read that photo. Please try another one.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        {imageUrl && (
          // Blob photos are already compressed client-side, so next/image would only add cost.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="size-16 rounded-2xl object-cover" />
        )}
        <label className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-ink/30 transition duration-200 ease-settle focus-within:outline-3 focus-within:outline-wax-deep hover:bg-ink/5">
          <CameraIcon aria-hidden size={18} />
          {uploading ? "Uploading..." : imageUrl ? "Change photo" : "Add a photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            disabled={uploading}
            aria-label={`Photo for ${itemLabel}`}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        {imageUrl && !uploading && (
          <button type="button" onClick={() => onChange(null)} className="min-h-11 px-2 text-sm font-semibold underline underline-offset-4">
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-sm font-medium text-wax">{error}</p>}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-11 items-center justify-center rounded-full ring-1 ring-ink/25 transition duration-200 ease-settle hover:bg-ink/5 active:scale-95 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

export function WishlistForm({ slug, budgetCentavos }: Props) {
  const router = useRouter();
  const storageKey = `wishlist-draft:${slug}`;

  const [draft] = useState(() => loadDraft(storageKey));
  const [name, setNameValue] = useState(draft.name);
  const [items, setItemsValue] = useState(draft.items);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  // Field errors are keyed by position, so any edit or reorder makes them stale.
  function clearErrors() {
    setErrors({});
    setFormError("");
  }
  const setName = (value: string) => {
    clearErrors();
    setNameValue(value);
  };
  const setItems: typeof setItemsValue = (change) => {
    clearErrors();
    setItemsValue(change);
  };
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elfCode, setElfCode] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ name, items }));
    } catch {
      // Without storage the form still works; it just won't survive a refresh.
    }
  }, [storageKey, name, items]);

  const total = items.reduce((sum, item) => sum + (parsePesoToCentavos(item.price) ?? 0), 0);

  const update = (key: string, change: Partial<Draft>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));

  function move(index: number, offset: -1 | 1) {
    setItems((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }

  function buildPayload() {
    const found: Record<string, string> = {};
    const payloadItems = items.map((item, index) => {
      const priceCentavos = parsePesoToCentavos(item.price);
      if (priceCentavos === null) found[`items.${index}.priceCentavos`] = "Enter a price, like 499 or 1,299.50";
      return {
        name: item.name,
        priceCentavos: priceCentavos ?? 0,
        url: item.url.trim() ? normalizeWebUrl(item.url) : null,
        imageUrl: item.imageUrl,
      };
    });

    const payload = { name, items: payloadItems };
    const parsed = wishlistSubmissionSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) found[issue.path.join(".")] ??= issue.message;
    }
    return { payload, found };
  }

  function review(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    const { found } = buildPayload();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError("A few things need fixing before you can seal this.");
      return;
    }
    setConfirming(true);
  }

  async function submit() {
    setBusy(true);
    setFormError("");
    try {
      const { elfCode: code } = await api<{ elfCode: string }>(`/api/exchanges/${slug}/participants`, { body: buildPayload().payload });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
      setConfirming(false);
      setElfCode(code);
      window.scrollTo({ top: 0 });
    } catch (error) {
      setConfirming(false);
      if (error instanceof ClientApiError && Object.keys(error.fields).length > 0) setErrors(error.fields);
      if (error instanceof ClientApiError && error.code === "network") {
        setFormError(`${error.message} If it already went through, ask the organizer for a new Elf Code.`);
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  if (elfCode) {
    return (
      <Paper className="rise">
        <h1 className="mb-1 font-display text-3xl font-semibold">You&apos;re in the pool, {name.trim()}</h1>
        <p className="mb-5 text-ink-soft">This Elf Code is how you&apos;ll open your envelope after the draw.</p>
        <SecretCode
          label="Your Elf Code"
          code={elfCode}
          explanation="This is the only time we can show it. If you lose it, the organizer can issue a new one, and the whole family will see that happened."
          confirmLabel="I saved my Elf Code"
          doneLabel="Take me to the pool"
          onDone={() => router.push(`/x/${slug}`)}
        />
      </Paper>
    );
  }

  return (
    <form onSubmit={review} noValidate className="grid gap-6 pb-24">
      <header className="rise">
        <h1 className="font-display text-4xl leading-tight font-semibold sm:text-5xl">What&apos;s on your list?</h1>
        <p className="mt-3 text-snow/85">
          Add as many things as you like. Your Secret Santa picks from these, and nobody else sees them.
          {budgetCentavos !== null && (
            <>
              {" "}The organizer suggests about <strong className="text-gold">{formatPeso(budgetCentavos)}</strong>.
            </>
          )}
        </p>
      </header>

      <Paper>
        <Field label="Your name" helper="The name your family knows you by. It has to be unique in this exchange." error={errors.name}>
          {(props) => <input {...props} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" className={inputClass} />}
        </Field>
      </Paper>

      <ol className="grid gap-4">
        <AnimatePresence initial={false}>
          {items.map((item, index) => {
            const priceCentavos = parsePesoToCentavos(item.price);
            const overBudget = budgetCentavos !== null && priceCentavos !== null && priceCentavos > budgetCentavos;
            const label = item.name.trim() || `item ${index + 1}`;
            const link = item.url.trim() ? normalizeWebUrl(item.url) : "";

            return (
              <motion.li
                key={item.key}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
              >
                <Paper>
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="font-display text-xl font-semibold">Wish {index + 1}</h2>
                    <div className="flex gap-2">
                      <IconButton label={`Move ${label} up`} onClick={() => move(index, -1)} disabled={index === 0}>
                        <ArrowUpIcon aria-hidden size={18} />
                      </IconButton>
                      <IconButton label={`Move ${label} down`} onClick={() => move(index, 1)} disabled={index === items.length - 1}>
                        <ArrowDownIcon aria-hidden size={18} />
                      </IconButton>
                      <IconButton label={`Remove ${label}`} onClick={() => setItems((all) => all.filter((x) => x.key !== item.key))} disabled={items.length === 1}>
                        <TrashIcon aria-hidden size={18} />
                      </IconButton>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <Field label="What is it?" error={errors[`items.${index}.name`]}>
                      {(props) => <input {...props} value={item.name} onChange={(e) => update(item.key, { name: e.target.value })} maxLength={120} className={inputClass} />}
                    </Field>

                    <Field
                      label="Price (₱)"
                      error={errors[`items.${index}.priceCentavos`]}
                      helper={overBudget ? "A little over the suggested budget, but it's your list." : undefined}
                    >
                      {(props) => <input {...props} value={item.price} onChange={(e) => update(item.key, { price: e.target.value })} inputMode="decimal" placeholder="499" className={inputClass} />}
                    </Field>

                    <Field label="Link to buy it (optional)" error={errors[`items.${index}.url`]}>
                      {(props) => <input {...props} value={item.url} onChange={(e) => update(item.key, { url: e.target.value })} inputMode="url" autoCapitalize="none" placeholder="Paste a Shopee or Lazada link" className={inputClass} />}
                    </Field>
                    {link && <StoreChip url={link} />}

                    <PhotoPicker slug={slug} imageUrl={item.imageUrl} onChange={(imageUrl) => update(item.key, { imageUrl })} itemLabel={label} />
                    {errors[`items.${index}.imageUrl`] && <ErrorNote>{errors[`items.${index}.imageUrl`]}</ErrorNote>}
                  </div>
                </Paper>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {items.length < MAX_ITEMS && (
        <Button variant="ghost" onClick={() => setItems([...items, newItem()])} className="w-full text-snow">
          <PlusIcon aria-hidden size={20} />
          Add another wish
        </Button>
      )}

      {formError && <ErrorNote>{formError}</ErrorNote>}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-pine-950/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-snow/80">Total of your list</p>
            <p aria-live="polite" className="truncate font-display text-2xl font-semibold tabular-nums text-gold">
              {formatPeso(total)}
            </p>
          </div>
          <Button type="submit" className="shrink-0" icon={<SealCheckIcon aria-hidden size={18} />}>
            Seal my list
          </Button>
        </div>
      </div>

      <Dialog
        open={confirming}
        title="Are you sure?"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep editing
            </Button>
            <Button onClick={submit} busy={busy}>
              {busy ? "Sealing..." : "Yes, seal it"}
            </Button>
          </>
        }
      >
        <p>
          <strong className="text-ink">You can&apos;t edit this after submitting.</strong> Once sealed, your {items.length}{" "}
          {items.length === 1 ? "wish is" : "wishes are"} permanently locked, and you&apos;ll join the pool as{" "}
          <strong className="text-ink">{name.trim()}</strong>.
        </p>
      </Dialog>
    </form>
  );
}
