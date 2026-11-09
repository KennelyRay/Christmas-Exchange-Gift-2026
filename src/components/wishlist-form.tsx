"use client";

import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, CameraIcon, CheckIcon, ImagesIcon, ClipboardTextIcon, PencilSimpleIcon, PlusIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { linkFromText, readClipboard } from "@/lib/device";
import { setDeviceValue } from "@/lib/hooks";
import { friendlyError, useT, type Translate } from "@/lib/i18n";
import { compressImage, MAX_SOURCE_BYTES } from "@/lib/images";
import type { MessageKey } from "@/lib/messages";
import { formatPeso, parsePesoToCentavos } from "@/lib/money";
import { fullNameOf } from "@/lib/names";
import { joinedNameKey } from "@/lib/stage";
import { normalizeWebUrl, storeNameFor } from "@/lib/stores";
import { MAX_ITEMS, wishlistItemSchema, wishlistSubmissionSchema } from "@/lib/validation";
import { SecretCode } from "./secret-code";
import { StoreChip } from "./store-chip";
import { Button, Dialog, ErrorNote, Field, inputClass, Paper } from "./ui";

type Draft = { key: string; name: string; price: string; url: string; imageUrl: string | null };
type Step = 1 | 2 | 3 | 4;
type Errors = Record<string, string>;

type Props = { slug: string; budgetCentavos: number | null; exchangeName: string };

const TOTAL_STEPS = 4;

const newItem = (): Draft => ({ key: crypto.randomUUID(), name: "", price: "", url: "", imageUrl: null });
const isBlank = (item: Draft) => !item.name.trim() && !item.price.trim() && !item.url.trim() && !item.imageUrl;

type SavedDraft = { firstName: string; lastName: string; items: Draft[]; editor: Draft | null; editing: boolean; step: Step };

function loadDraft(storageKey: string): SavedDraft {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<SavedDraft> | null;
    if (saved) {
      const items = Array.isArray(saved.items) ? saved.items.filter((item) => !isBlank(item)) : [];
      const editing = saved.editing ?? items.length === 0;
      return {
        firstName: saved.firstName ?? "",
        lastName: saved.lastName ?? "",
        items,
        editing,
        editor: saved.editor ?? (editing ? newItem() : null),
        step: saved.step && saved.step >= 1 && saved.step <= TOTAL_STEPS ? saved.step : 1,
      };
    }
  } catch {
    // A missing or unreadable draft just means starting fresh.
  }
  return { firstName: "", lastName: "", items: [], editor: newItem(), editing: true, step: 1 };
}

function itemErrorsOf(item: Draft, t: Translate) {
  const errors: Errors = {};
  if (!wishlistItemSchema.shape.name.safeParse(item.name).success) errors.name = t("err.itemName");

  const centavos = parsePesoToCentavos(item.price);
  if (centavos === null || centavos <= 0) errors.price = t("err.price");
  else if (!wishlistItemSchema.shape.priceCentavos.safeParse(centavos).success) errors.price = t("err.priceHigh");

  if (item.url.trim() && !wishlistItemSchema.shape.url.safeParse(normalizeWebUrl(item.url)).success) errors.url = t("err.link");
  return errors;
}

function nameErrorsOf(firstName: string, lastName: string, t: Translate) {
  const errors: Errors = {};
  const { shape } = wishlistSubmissionSchema;
  if (!firstName.trim()) errors.firstName = t("err.firstName");
  else if (!shape.firstName.safeParse(firstName).success) errors.firstName = t("err.nameLetters");
  if (!lastName.trim()) errors.lastName = t("err.lastName");
  else if (!shape.lastName.safeParse(lastName).success) errors.lastName = t("err.nameLetters");
  return errors;
}

/** Adds the commas as you type: "1299.5" becomes "1,299.5". */
function formatPriceInput(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cleaned.includes(".") ? `${grouped}.${rest.join("").slice(0, 2)}` : grouped;
}

type FieldBindings = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

function PriceInput({ value, onChange, bindings }: { value: string; onChange: (value: string) => void; bindings: FieldBindings }) {
  return (
    <div className="relative">
      <span aria-hidden className="absolute top-1/2 left-4 -translate-y-1/2 text-xl font-bold text-ink">
        ₱
      </span>
      <input
        {...bindings}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        className={`${inputClass} pl-10`}
        onChange={(event) => {
          const input = event.target;
          const caret = input.selectionStart ?? input.value.length;
          const charsBeforeCaret = input.value.slice(0, caret).replace(/[^\d.]/g, "").length;
          const next = formatPriceInput(input.value);
          onChange(next);
          // Commas shift the text, so put the cursor back after the same digit.
          requestAnimationFrame(() => {
            let position = 0;
            for (let seen = 0; position < next.length && seen < charsBeforeCaret; position++) {
              if (/[\d.]/.test(next[position])) seen++;
            }
            input.setSelectionRange(position, position);
          });
        }}
      />
    </div>
  );
}

function PhotoButton({ icon, label, capture, disabled, onPick, className = "" }: { icon: ReactNode; label: string; capture?: boolean; disabled: boolean; onPick: (file: File | undefined) => void; className?: string }) {
  return (
    <label className={`relative flex min-h-tap-lg cursor-pointer items-center justify-center gap-2 rounded-full px-6 py-2 text-center text-lg font-bold ring-2 ring-ink/50 transition duration-200 ease-settle focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-wax-deep hover:bg-ink/5 ${className}`}>
      {icon}
      {label}
      <input
        type="file"
        accept={capture ? "image/*" : "image/jpeg,image/png,image/webp,image/heic"}
        capture={capture ? "environment" : undefined}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function PhotoPicker({ slug, imageUrl, onChange, onBusy }: { slug: string; imageUrl: string | null; onChange: (url: string | null) => void; onBusy: (busy: boolean) => void }) {
  const t = useT();
  const [uploading, setUploadingValue] = useState(false);
  const [error, setError] = useState("");

  function setUploading(value: boolean) {
    setUploadingValue(value);
    onBusy(value);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.size > MAX_SOURCE_BYTES) {
      setError(t("err.photoBig"));
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", await compressImage(file), "photo");
      const { url } = await api<{ url: string }>(`/api/exchanges/${slug}/uploads`, { form });
      onChange(url);
    } catch (caught) {
      setError(caught instanceof ClientApiError ? friendlyError(caught, t) : t("err.photoRead"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-lg font-bold">{t("wiz.item.photoLabel")}</p>
      {imageUrl && (
        // Blob photos are already compressed client-side, so next/image would only add cost.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" width={160} height={160} className="size-40 rounded-tile object-cover" />
      )}
      {uploading ? (
        <p role="status" className="flex min-h-tap-lg items-center text-lg font-bold">
          {t("wiz.item.uploading")}
        </p>
      ) : imageUrl ? (
        <div className="grid gap-2">
          <PhotoButton icon={<ImagesIcon aria-hidden size={24} />} label={t("wiz.item.changePhoto")} disabled={uploading} onPick={(file) => void pick(file)} />
          <Button variant="ghost" onClick={() => onChange(null)} className="w-full">
            {t("wiz.item.removePhoto")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {/* Computers have no camera to open, so this only shows on touch screens. */}
          <PhotoButton icon={<CameraIcon aria-hidden size={24} />} label={t("wiz.item.camera")} capture disabled={uploading} onPick={(file) => void pick(file)} className="hidden pointer-coarse:flex" />
          <PhotoButton icon={<ImagesIcon aria-hidden size={24} />} label={t("wiz.item.gallery")} disabled={uploading} onPick={(file) => void pick(file)} />
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

function StoreLinkField({ value, error, onChange }: { value: string; error?: string; onChange: (value: string) => void }) {
  const t = useT();
  const [hint, setHint] = useState("");
  const link = value.trim() ? normalizeWebUrl(value) : "";
  const store = link ? storeNameFor(link) : null;

  async function paste() {
    setHint("");
    const text = await readClipboard();
    if (text === null) {
      setHint(t("wiz.item.pasteDenied"));
      return;
    }
    const found = linkFromText(text);
    if (found) onChange(found);
    else setHint(t("wiz.item.pasteEmpty"));
  }

  return (
    <div className="grid gap-2">
      <Field label={t("wiz.item.linkLabel")} error={error}>
        {(props) => (
          <input
            {...props}
            value={value}
            onChange={(e) => {
              setHint("");
              onChange(linkFromText(e.target.value) || e.target.value);
            }}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={inputClass}
          />
        )}
      </Field>
      {store ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
            <CheckIcon aria-hidden size={24} weight="bold" className="text-pine-700" />
            {t("wiz.item.linkAdded")} <StoreChip url={link} />
          </p>
          <Button variant="ghost" onClick={() => onChange("")} className="w-full">
            {t("wiz.item.removeLink")}
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="lg" onClick={() => void paste()} className="w-full">
          <ClipboardTextIcon aria-hidden size={24} className="shrink-0" />
          {t("wiz.item.paste")}
        </Button>
      )}
      {hint && (
        <p role="status" className="text-base font-bold">
          {hint}
        </p>
      )}
    </div>
  );
}

function ItemSummary({ item }: { item: Draft }) {
  const centavos = parsePesoToCentavos(item.price);
  const link = item.url.trim() ? normalizeWebUrl(item.url) : "";
  return (
    <div className="flex min-w-0 items-start gap-4">
      {item.imageUrl && (
        // Blob photos are already compressed client-side, so next/image would only add cost.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" width={80} height={80} loading="lazy" className="size-20 shrink-0 rounded-tile object-cover" />
      )}
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-xl leading-snug font-bold wrap-anywhere">{item.name}</p>
        {centavos !== null && <p className="text-lg font-bold text-wax-deep tabular-nums">{formatPeso(centavos)}</p>}
        {link && <StoreChip url={link} />}
      </div>
    </div>
  );
}

function StepHeading({ headingRef, title, children }: { headingRef: React.RefObject<HTMLHeadingElement | null>; title: string; children?: ReactNode }) {
  return (
    <header>
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-4xl font-semibold outline-none">
        {title}
      </h1>
      {children && <p className="mt-2 text-lg">{children}</p>}
    </header>
  );
}

export function WishlistForm({ slug, budgetCentavos, exchangeName }: Props) {
  const router = useRouter();
  const t = useT();
  const storageKey = `wishlist-draft:${slug}`;

  const [draft] = useState(() => loadDraft(storageKey));
  const [step, setStep] = useState<Step>(draft.step);
  const [firstName, setFirstName] = useState(draft.firstName);
  const [lastName, setLastName] = useState(draft.lastName);
  const [items, setItems] = useState(draft.items);
  const [editor, setEditor] = useState(draft.editor);
  const [editing, setEditing] = useState(draft.editing);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [removing, setRemoving] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [elfCode, setElfCode] = useState<string | null>(null);

  const sending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasMoved = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ firstName, lastName, items, editor, editing, step }));
    } catch {
      // Without storage the form still works; it just won't survive a refresh.
    }
  }, [storageKey, firstName, lastName, items, editor, editing, step]);

  // Screen readers should land on the new screen's title, not stay on a button that's gone.
  useEffect(() => {
    if (hasMoved.current) heading.current?.focus({ preventScroll: true });
  }, [step, editing]);

  const fullName = fullNameOf(firstName.trim(), lastName.trim());
  const total = items.reduce((sum, item) => sum + (parsePesoToCentavos(item.price) ?? 0), 0);

  function moved() {
    hasMoved.current = true;
    setErrors({});
    setFormError("");
    window.scrollTo({ top: 0 });
  }

  function goTo(next: Step) {
    moved();
    setStep(next);
  }

  function openEditor(item: Draft, itemErrors: Errors = {}) {
    moved();
    setEditor(item);
    setEditing(true);
    setStep(2);
    setErrors(itemErrors);
  }

  function clearError(field: string) {
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)));
    setFormError("");
  }

  function updateEditor(change: Partial<Draft>) {
    setEditor((current) => (current ? { ...current, ...change } : current));
    Object.keys(change).forEach((field) => clearError(field));
  }

  function saveItem() {
    if (!editor) return;
    const found = itemErrorsOf(editor, t);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    const saved = editor;
    setItems((current) => (current.some((item) => item.key === saved.key) ? current.map((item) => (item.key === saved.key ? saved : item)) : [...current, saved]));
    moved();
    setEditor(null);
    setEditing(false);
  }

  /** A new item that was only half typed comes back when they return to add one. */
  function addAnother() {
    const resumable = editor && !items.some((item) => item.key === editor.key) && !isBlank(editor);
    openEditor(resumable ? editor : newItem());
  }

  function move(index: number, offset: -1 | 1) {
    setItems((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }

  function confirmRemove() {
    const target = removing;
    if (!target) return;
    const remaining = items.filter((item) => item.key !== target.key);
    setItems(remaining);
    setRemoving(null);
    if (remaining.length === 0) openEditor(newItem());
  }

  /** Sends the person to the first thing that needs fixing. True if everything is fine. */
  function everythingValid() {
    const nameErrors = nameErrorsOf(firstName, lastName, t);
    if (Object.keys(nameErrors).length > 0) {
      goTo(1);
      setErrors(nameErrors);
      return false;
    }
    if (items.length === 0) {
      openEditor(editor ?? newItem());
      return false;
    }
    for (const item of items) {
      const found = itemErrorsOf(item, t);
      if (Object.keys(found).length > 0) {
        openEditor(item, found);
        return false;
      }
    }
    return true;
  }

  function advance(event: FormEvent) {
    event.preventDefault();
    if (step === 1) {
      const found = nameErrorsOf(firstName, lastName, t);
      if (Object.keys(found).length > 0) setErrors(found);
      else goTo(2);
    } else if (step === 2) {
      if (editing) saveItem();
      else if (everythingValid()) goTo(3);
    } else if (step === 3) {
      if (everythingValid()) goTo(4);
    } else {
      void submit();
    }
  }

  function showServerProblem(error: ClientApiError) {
    if (error.code === "name_taken") {
      goTo(1);
      setErrors({ firstName: t("err.nameTaken") });
      return;
    }
    const itemField = Object.keys(error.fields).find((field) => field.startsWith("items."));
    if (itemField) {
      const [, index, field] = itemField.split(".");
      const item = items[Number(index)];
      if (item) {
        const target = field === "priceCentavos" ? "price" : field;
        openEditor(item, { [target]: error.fields[itemField] });
        return;
      }
    }
    if (error.fields.firstName || error.fields.lastName) {
      goTo(1);
      setErrors(error.fields);
      return;
    }
    setFormError(error.code === "network" ? t("err.networkSubmit") : friendlyError(error, t));
  }

  async function submit() {
    if (sending.current || !everythingValid()) return;
    sending.current = true;
    setBusy(true);
    setFormError("");
    try {
      const payload = {
        firstName,
        lastName,
        items: items.map((item) => ({
          name: item.name,
          priceCentavos: parsePesoToCentavos(item.price) ?? 0,
          url: item.url.trim() ? normalizeWebUrl(item.url) : null,
          imageUrl: item.imageUrl,
        })),
      };
      const { elfCode: code } = await api<{ elfCode: string }>(`/api/exchanges/${slug}/participants`, { body: payload });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
      setDeviceValue(joinedNameKey(slug), firstName.trim());
      setElfCode(code);
      window.scrollTo({ top: 0 });
    } catch (error) {
      if (error instanceof ClientApiError) showServerProblem(error);
      else setFormError(friendlyError(error, t));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (elfCode) {
    return (
      <main className="safe-top safe-x mx-auto w-full max-w-2xl pb-8">
        <Paper className="rise mt-2">
          <h1 className="font-display text-4xl font-semibold wrap-anywhere">{t("code.title", { name: firstName.trim() })}</h1>
          <p className="mt-2 mb-6 text-lg text-ink-soft">{t("code.body")}</p>
          <SecretCode
            label={t("code.label")}
            code={elfCode}
            explanation={t("code.explain")}
            confirmLabel={t("code.confirm")}
            doneLabel={t("code.done")}
            ownerName={fullName}
            exchangeName={exchangeName}
            onDone={() => router.push(`/x/${slug}`)}
          />
        </Paper>
      </main>
    );
  }

  const backClass = "-ml-2 flex min-h-tap w-fit items-center gap-2 rounded-full px-2 text-lg font-bold text-gold";
  const inEditor = step === 2 && editing;
  const backLabel = (
    <>
      <ArrowLeftIcon aria-hidden size={24} />
      {t("common.back")}
    </>
  );

  const stepLabel = t("wiz.step", { n: step });
  const nextLabels: Record<Step, MessageKey> = {
    1: "wiz.next",
    2: editing ? "wiz.item.save" : "wiz.list.next",
    3: "wiz.review.next",
    4: "wiz.confirm.yes",
  };

  function back() {
    if (inEditor && items.length > 0) {
      moved();
      setEditing(false);
    } else if (step > 1) {
      goTo((step - 1) as Step);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col">
      <header className="safe-top safe-x">
        {step === 1 ? (
          <Link href={`/x/${slug}`} className={backClass}>
            {backLabel}
          </Link>
        ) : (
          <button type="button" onClick={back} className={backClass}>
            {backLabel}
          </button>
        )}
        <p className="mt-2 text-lg font-bold">{stepLabel}</p>
        <div role="progressbar" aria-label={stepLabel} aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step} className="mt-2 grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-2 rounded-full ${n <= step ? "bg-gold" : "bg-white/25"}`} />
          ))}
        </div>
      </header>

      <form onSubmit={advance} noValidate className="flex flex-1 flex-col">
        <div key={`${step}-${editing}`} className="rise safe-x grid flex-1 content-start gap-6 py-6">
          {step === 1 && (
            <>
              <StepHeading headingRef={heading} title={t("wiz.name.title")}>
                {t("wiz.name.body")}
              </StepHeading>
              <Paper>
                <div className="grid gap-6">
                  <Field label={t("wiz.first")} error={errors.firstName}>
                    {(props) => (
                      <input
                        {...props}
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          clearError("firstName");
                        }}
                        maxLength={40}
                        autoComplete="given-name"
                        autoCapitalize="words"
                        className={inputClass}
                      />
                    )}
                  </Field>
                  <Field label={t("wiz.last")} error={errors.lastName}>
                    {(props) => (
                      <input
                        {...props}
                        value={lastName}
                        onChange={(e) => {
                          setLastName(e.target.value);
                          clearError("lastName");
                        }}
                        maxLength={40}
                        autoComplete="family-name"
                        autoCapitalize="words"
                        className={inputClass}
                      />
                    )}
                  </Field>
                  <p className="text-base text-ink-soft">{t("wiz.familyNote")}</p>
                </div>
              </Paper>
              <p className="text-base">{t("wiz.saved")}</p>
            </>
          )}

          {inEditor && editor && (
            <>
              <StepHeading headingRef={heading} title={t("wiz.items.title")}>
                {t("wiz.items.body")}
                {budgetCentavos !== null && <> {t("wiz.items.budget", { amount: formatPeso(budgetCentavos) })}</>}
              </StepHeading>
              <Paper>
                <div className="grid gap-6">
                  <h2 className="font-display text-2xl font-semibold">
                    {t("wiz.item.heading", {
                      n: items.some((item) => item.key === editor.key) ? items.findIndex((item) => item.key === editor.key) + 1 : items.length + 1,
                    })}
                  </h2>
                  <Field label={t("wiz.item.name")} error={errors.name}>
                    {(props) => <input {...props} value={editor.name} onChange={(e) => updateEditor({ name: e.target.value })} maxLength={120} autoComplete="off" className={inputClass} />}
                  </Field>
                  <Field
                    label={t("wiz.item.price")}
                    error={errors.price}
                    helper={budgetCentavos !== null && (parsePesoToCentavos(editor.price) ?? 0) > budgetCentavos ? t("wiz.item.overBudget") : undefined}
                  >
                    {(props) => <PriceInput bindings={props} value={editor.price} onChange={(price) => updateEditor({ price })} />}
                  </Field>
                  <PhotoPicker slug={slug} imageUrl={editor.imageUrl} onChange={(imageUrl) => updateEditor({ imageUrl })} onBusy={setPhotoBusy} />
                  <StoreLinkField value={editor.url} error={errors.url} onChange={(url) => updateEditor({ url })} />
                </div>
              </Paper>
            </>
          )}

          {step === 2 && !editing && (
            <>
              <StepHeading headingRef={heading} title={t("wiz.list.yours")} />
              <ol className="grid gap-4">
                {items.map((item, index) => (
                  <li key={item.key}>
                    <Paper>
                      <ItemSummary item={item} />
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button variant="ghost" fit onClick={() => openEditor(item)}>
                          <PencilSimpleIcon aria-hidden size={20} className="shrink-0" />
                          {t("common.edit")}
                        </Button>
                        <Button variant="ghost" fit onClick={() => setRemoving(item)}>
                          <TrashIcon aria-hidden size={20} className="shrink-0" />
                          {t("common.remove")}
                        </Button>
                        {items.length > 1 && (
                          <>
                            <Button variant="ghost" fit disabled={index === 0} onClick={() => move(index, -1)}>
                              <ArrowUpIcon aria-hidden size={20} className="shrink-0" />
                              {t("wiz.list.moveUp")}
                            </Button>
                            <Button variant="ghost" fit disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                              <ArrowDownIcon aria-hidden size={20} className="shrink-0" />
                              {t("wiz.list.moveDown")}
                            </Button>
                          </>
                        )}
                      </div>
                    </Paper>
                  </li>
                ))}
              </ol>
              {items.length < MAX_ITEMS && (
                <Button variant="ghost" size="lg" onClick={addAnother} className="w-full text-snow">
                  <PlusIcon aria-hidden size={24} className="shrink-0" />
                  {t("wiz.list.add")}
                </Button>
              )}
              <p className="text-lg">
                {t("wiz.list.total")}: <strong className="font-display text-2xl font-semibold text-gold tabular-nums">{formatPeso(total)}</strong>
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <StepHeading headingRef={heading} title={t("wiz.review.title")}>
                {t("wiz.review.body")}
              </StepHeading>
              <Paper>
                <h2 className="text-lg font-bold text-ink-soft">{t("wiz.review.yourName")}</h2>
                <p className="mt-1 font-display text-3xl font-semibold wrap-anywhere">{fullName}</p>
                <Button variant="ghost" onClick={() => goTo(1)} className="mt-4 w-full">
                  {t("wiz.review.editName")}
                </Button>
              </Paper>
              <Paper>
                <h2 className="mb-4 text-lg font-bold text-ink-soft">{t("wiz.review.yourItems")}</h2>
                <ol className="divide-y-2 divide-ink/10">
                  {items.map((item) => (
                    <li key={item.key} className="py-4 first:pt-0">
                      <ItemSummary item={item} />
                    </li>
                  ))}
                </ol>
                <p className="mt-2 border-t-2 border-ink/15 pt-4 text-lg font-bold">
                  {t("wiz.list.total")}: <span className="text-wax-deep tabular-nums">{formatPeso(total)}</span>
                </p>
                <Button
                  variant="ghost"
                  onClick={() => {
                    moved();
                    setEditing(false);
                    setStep(2);
                  }}
                  className="mt-4 w-full"
                >
                  {t("wiz.review.editItems")}
                </Button>
              </Paper>
            </>
          )}

          {step === 4 && (
            <Paper>
              <WarningIcon aria-hidden size={56} weight="fill" className="text-wax-deep" />
              <h1 ref={heading} tabIndex={-1} className="mt-2 font-display text-3xl font-semibold outline-none">
                {t("wiz.confirm.title")}
              </h1>
              <p className="mt-4 text-xl font-bold">{t("wiz.confirm.body")}</p>
              <p className="mt-2 text-lg wrap-anywhere text-ink-soft">
                {items.length === 1 ? t("wiz.confirm.summary1", { name: fullName }) : t("wiz.confirm.summary", { name: fullName, n: items.length })}
              </p>
            </Paper>
          )}

          {formError && <ErrorNote>{formError}</ErrorNote>}
        </div>

        <div className="dock safe-bottom safe-x grid gap-2 bg-pine-950 pt-2 shadow-dock md:static md:bg-transparent md:pb-8 md:shadow-none">
          <Button type="submit" busy={busy} disabled={photoBusy} className="w-full">
            {busy ? t("wiz.confirm.busy") : photoBusy ? t("wiz.item.uploading") : t(nextLabels[step])}
          </Button>
          {step === 4 && (
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => goTo(3)} className="w-full">
              {t("wiz.confirm.no")}
            </Button>
          )}
        </div>
      </form>

      <Dialog
        open={removing !== null}
        title={t("wiz.list.removeTitle")}
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setRemoving(null)}>
              {t("wiz.list.keep")}
            </Button>
            <Button onClick={confirmRemove}>{t("wiz.list.removeYes")}</Button>
          </>
        }
      >
        <p className="text-lg">{t("wiz.list.removeBody", { name: removing?.name ?? "" })}</p>
      </Dialog>
    </div>
  );
}
