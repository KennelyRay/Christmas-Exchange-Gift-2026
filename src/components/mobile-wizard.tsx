"use client";

import { ArrowLeftIcon, CaretRightIcon, PlusIcon, TrashIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { goBack, historyDepth, pushEntry, replaceEntry, whenHistorySettled } from "@/lib/app-history";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { formatPeso, parsePesoToCentavos } from "@/lib/money";
import { MAX_ITEMS } from "@/lib/validation";
import { SecretCode } from "./secret-code";
import { Button, Dialog, ErrorNote, Field, inputClass } from "./ui";
import { isBlank, TOTAL_STEPS, type Draft, type Step, type WishlistWizard } from "./use-wishlist-wizard";
import { ItemSummary, PhotoPicker, PriceInput, StoreLinkField } from "./wishlist-fields";

type Props = { wizard: WishlistWizard; heading: React.RefObject<HTMLHeadingElement | null>; slug: string; exchangeId: string; budgetCentavos: number | null; exchangeName: string };

const query = (step: Step, editing: boolean) => `?step=${step}${editing ? "&item=1" : ""}`;
const card = "paper rounded-card bg-paper p-4 text-ink shadow-card";

/** Keeps the address bar and the wizard in step, so the back button walks back through it. */
function useWizardHistory({ step, editing, editor, setStep, setEditing, goTo }: WishlistWizard) {
  const previous = useRef<{ step: Step; editing: boolean } | null>(null);
  const startDepth = useRef(0);
  const knownAddress = useRef("");

  useEffect(() => {
    const path = window.location.pathname;
    const last = previous.current;
    previous.current = { step, editing };

    if (!last) startDepth.current = historyDepth();
    if (window.location.search === query(step, editing)) {
      knownAddress.current = window.location.search;
      return;
    }

    if (!last) {
      // Resuming a saved draft: the item form needs the list behind it to go back to.
      replaceEntry(path + query(step, false));
      if (editing) pushEntry(path + query(step, true));
      knownAddress.current = window.location.search;
    } else if (last.editing && !editing && last.step === step) {
      whenHistorySettled(goBack);
    } else {
      whenHistorySettled(() => {
        if (window.location.search !== query(step, editing)) pushEntry(path + query(step, editing));
        knownAddress.current = window.location.search;
      });
    }
  }, [step, editing]);

  const followAddress = useEffectEvent(() => {
    // A sheet closing also fires popstate, but it leaves the address where it was.
    if (window.location.search === knownAddress.current) return;
    knownAddress.current = window.location.search;

    const params = new URLSearchParams(window.location.search);
    const target = Number(params.get("step"));
    if (target < 1 || target > TOTAL_STEPS) return;
    previous.current = { step: target as Step, editing: params.has("item") && editor !== null };
    setStep(target as Step);
    setEditing(params.has("item") && editor !== null);
  });

  useEffect(() => {
    const listener = () => followAddress();
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  return () => {
    if (historyDepth() > startDepth.current) window.history.back();
    else goTo((step - 1) as Step);
  };
}

function CompactItem({ item, onOpen }: { item: Draft; onOpen: () => void }) {
  const centavos = parsePesoToCentavos(item.price);
  return (
    <button type="button" onClick={onOpen} className="paper flex min-h-tap-lg w-full min-w-0 shrink-0 items-center gap-2 rounded-tile bg-paper px-4 py-2 text-left">
      <span className="min-w-0 flex-1 text-lg leading-snug font-bold wrap-anywhere">{item.name}</span>
      {centavos !== null && <span className="shrink-0 text-lg font-bold text-wax-deep tabular-nums">{formatPeso(centavos)}</span>}
      <CaretRightIcon aria-hidden size={20} weight="bold" className="shrink-0" />
    </button>
  );
}

function Title({ headingRef, children }: { headingRef: React.RefObject<HTMLHeadingElement | null>; children: ReactNode }) {
  return (
    <h1 ref={headingRef} tabIndex={-1} className="shrink-0 font-display text-3xl font-semibold outline-none">
      {children}
    </h1>
  );
}

export function MobileWishlist({ wizard: w, heading, slug, exchangeId, budgetCentavos, exchangeName }: Props) {
  const router = useRouter();
  const t = useT();
  const [leaving, setLeaving] = useState(false);
  const [viewing, setViewing] = useState<Draft | null>(null);
  const back = useWizardHistory(w);

  const { step, items, editor, errors } = w;
  const home = `/x/${slug}`;

  if (w.elfCode) {
    return (
      <div className="app-screen">
        <main className="safe-top safe-x safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className={`${card} rise`}>
            <h1 className="font-display text-3xl font-semibold wrap-anywhere">{t("code.title", { name: w.firstName.trim() })}</h1>
            <p className="mt-2 mb-4 text-lg text-ink-soft">{t("code.body")}</p>
            <SecretCode
              label={t("code.label")}
              code={w.elfCode}
              explanation={t("code.explain")}
              confirmLabel={t("code.confirm")}
              doneLabel={t("code.done")}
              ownerName={w.fullName}
              exchangeName={exchangeName}
              onDone={() => router.push(home)}
            />
          </div>
        </main>
      </div>
    );
  }

  const inItemForm = step >= 2 && w.editing && editor !== null;
  const isSavedItem = editor !== null && items.some((item) => item.key === editor.key);
  const itemNumber = editor === null ? 0 : isSavedItem ? items.findIndex((item) => item.key === editor.key) + 1 : items.length + 1;

  const hasProgress = Boolean(w.firstName.trim() || w.lastName.trim() || items.length > 0 || (editor && !isBlank(editor)));
  const askToLeave = () => (hasProgress ? setLeaving(true) : router.push(home));

  const closeItem = () => {
    w.moved();
    w.setEditing(false);
  };

  const stepLabel = t("wiz.step", { n: step });
  const nextLabel: MessageKey = inItemForm ? "wiz.item.saveShort" : ({ 1: "wiz.next", 2: "wiz.list.next", 3: "wiz.review.next", 4: "wiz.confirm.yes" } as const)[step];
  const headerButton = "flex min-h-tap shrink-0 items-center gap-1 rounded-full text-base font-bold text-gold";

  return (
    <div className="app-screen">
      <header className="safe-top safe-x shrink-0">
        {inItemForm ? (
          <div className="flex min-h-tap items-center justify-between gap-2">
            <button type="button" onClick={closeItem} className={headerButton}>
              <XIcon aria-hidden size={22} />
              {t("common.close")}
            </button>
            <p className="text-lg font-bold">{t("wiz.item.heading", { n: itemNumber })}</p>
            {isSavedItem ? (
              <button type="button" onClick={() => w.setRemoving(editor)} className={headerButton}>
                <TrashIcon aria-hidden size={22} />
                {t("common.remove")}
              </button>
            ) : (
              <span className="w-16" />
            )}
          </div>
        ) : (
          <>
            <div className="flex min-h-tap items-center justify-between gap-2">
              {step > 1 ? (
                <button type="button" onClick={back} className={headerButton}>
                  <ArrowLeftIcon aria-hidden size={22} />
                  {t("common.back")}
                </button>
              ) : (
                <span className="w-16" />
              )}
              <p className="min-w-0 text-center text-base font-bold">{stepLabel}</p>
              <button type="button" onClick={askToLeave} className={headerButton}>
                <XIcon aria-hidden size={22} />
                {t("common.close")}
              </button>
            </div>
            <div role="progressbar" aria-label={stepLabel} aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step} className="grid grid-cols-4 gap-2 pb-1">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className={`h-2 rounded-full ${n <= step ? "bg-gold" : "bg-white/25"}`} />
              ))}
            </div>
          </>
        )}
      </header>

      <form onSubmit={w.advance} noValidate className="flex min-h-0 flex-1 flex-col">
        <div key={`${step}-${inItemForm}`} className="rise safe-x flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain py-3">
          {inItemForm && editor && (
            <div className={`${card} grid shrink-0 gap-2`}>
              <Field label={t("wiz.item.name")} error={errors.name}>
                {(props) => <input {...props} value={editor.name} onChange={(e) => w.updateEditor({ name: e.target.value })} maxLength={120} autoComplete="off" className={inputClass} />}
              </Field>
              <Field
                label={t("wiz.item.price")}
                error={errors.price}
                helper={budgetCentavos !== null && (parsePesoToCentavos(editor.price) ?? 0) > budgetCentavos ? t("wiz.item.overBudget") : undefined}
              >
                {(props) => <PriceInput bindings={props} value={editor.price} onChange={(price) => w.updateEditor({ price })} />}
              </Field>
              <PhotoPicker
                compact
                exchangeId={exchangeId}
                photo={editor.photo}
                itemName={editor.name.trim() || t("wiz.item.name")}
                error={errors.photo}
                onChange={(photo) => w.updateEditor({ photo })}
                onBusy={w.setPhotoBusy}
              />
              <StoreLinkField compact value={editor.url} error={errors.url} onChange={(url) => w.updateEditor({ url })} />
            </div>
          )}

          {!inItemForm && step === 1 && (
            <>
              <Title headingRef={heading}>{t("wiz.name.title")}</Title>
              <div className={`${card} grid shrink-0 gap-4`}>
                <Field label={t("wiz.first")} error={errors.firstName}>
                  {(props) => (
                    <input
                      {...props}
                      value={w.firstName}
                      onChange={(e) => {
                        w.setFirstName(e.target.value);
                        w.clearError("firstName");
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
                      value={w.lastName}
                      onChange={(e) => {
                        w.setLastName(e.target.value);
                        w.clearError("lastName");
                      }}
                      maxLength={40}
                      autoComplete="family-name"
                      autoCapitalize="words"
                      className={inputClass}
                    />
                  )}
                </Field>
                <p className="text-sm text-ink-soft">{t("wiz.familyShort")}</p>
              </div>
            </>
          )}

          {!inItemForm && step === 2 && (
            <>
              <Title headingRef={heading}>{t("wiz.items.title")}</Title>
              {budgetCentavos !== null && <p className="shrink-0 text-sm">{t("wiz.items.budget", { amount: formatPeso(budgetCentavos) })}</p>}
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
                {items.length === 0 && <p className="text-lg">{t("wiz.list.none")}</p>}
                {items.map((item) => (
                  <CompactItem key={item.key} item={item} onOpen={() => w.openEditor(item)} />
                ))}
              </div>
              {items.length < MAX_ITEMS && (
                <Button variant="ghost" size="lg" onClick={w.addAnother} className="w-full shrink-0">
                  <PlusIcon aria-hidden size={24} className="shrink-0" />
                  {t("wiz.list.addItem")}
                </Button>
              )}
              {w.total > 0 && (
                <p className="shrink-0 text-sm">
                  {t("wiz.list.total")}: <strong className="font-bold text-gold tabular-nums">{formatPeso(w.total)}</strong>
                </p>
              )}
            </>
          )}

          {!inItemForm && step === 3 && (
            <>
              <Title headingRef={heading}>{t("wiz.review.title")}</Title>
              <div className={`${card} flex shrink-0 items-center gap-2`}>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-ink-soft">{t("wiz.review.yourName")}</p>
                  <p className="font-display text-2xl font-semibold wrap-anywhere">{w.fullName}</p>
                </div>
                <Button variant="ghost" fit onClick={() => w.goTo(1)} className="shrink-0">
                  {t("wiz.review.change")}
                </Button>
              </div>
              <p className="shrink-0 text-sm">{t("wiz.review.tapItem")}</p>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
                {items.map((item) => (
                  <CompactItem key={item.key} item={item} onOpen={() => setViewing(item)} />
                ))}
              </div>
              {w.total > 0 && (
                <p className="shrink-0 text-sm">
                  {t("wiz.list.total")}: <strong className="font-bold text-gold tabular-nums">{formatPeso(w.total)}</strong>
                </p>
              )}
            </>
          )}

          {!inItemForm && step === 4 && (
            <div className={`${card} shrink-0`}>
              <WarningIcon aria-hidden size={40} weight="fill" className="text-wax-deep" />
              <h1 ref={heading} tabIndex={-1} className="mt-1 font-display text-3xl font-semibold outline-none">
                {t("wiz.confirm.title")}
              </h1>
              <p className="mt-2 text-xl font-bold">{t("wiz.confirm.body")}</p>
              <p className="mt-1 text-lg wrap-anywhere text-ink-soft">{items.length === 1 ? t("wiz.confirm.summary1", { name: w.fullName }) : t("wiz.confirm.summary", { name: w.fullName, n: items.length })}</p>
            </div>
          )}

          {w.formError && <ErrorNote className="shrink-0">{w.formError}</ErrorNote>}
        </div>

        <div className="safe-bottom safe-x grid shrink-0 gap-2 bg-pine-950 pt-2 shadow-dock">
          <Button type="submit" busy={w.busy} disabled={w.photoBusy} className="w-full">
            {w.busy ? t("wiz.confirm.busy") : w.photoBusy ? t("wiz.item.uploading") : t(nextLabel)}
          </Button>
          {!inItemForm && step === 4 && (
            <Button variant="ghost" size="md" disabled={w.busy} onClick={back} className="w-full">
              {t("wiz.confirm.no")}
            </Button>
          )}
        </div>
      </form>

      <Dialog
        open={leaving}
        title={t("wiz.leave.title")}
        onClose={() => setLeaving(false)}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => router.push(home)}>
              {t("wiz.leave.go")}
            </Button>
            <Button onClick={() => setLeaving(false)}>{t("wiz.leave.stay")}</Button>
          </>
        }
      >
        <p className="text-lg">{t("wiz.leave.body")}</p>
      </Dialog>

      <Dialog
        open={viewing !== null}
        title={viewing?.name ?? ""}
        onClose={() => setViewing(null)}
        footer={
          <Button
            onClick={() => {
              const item = viewing;
              setViewing(null);
              if (item) w.openEditorInPlace(item);
            }}
            className="w-full"
          >
            {t("wiz.review.editItem")}
          </Button>
        }
      >
        {viewing && <ItemSummary item={viewing} />}
      </Dialog>

      <Dialog
        open={w.removing !== null}
        title={t("wiz.list.removeTitle")}
        onClose={() => w.setRemoving(null)}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => w.setRemoving(null)}>
              {t("wiz.list.keep")}
            </Button>
            <Button onClick={w.confirmRemove}>{t("wiz.list.removeYes")}</Button>
          </>
        }
      >
        <p className="text-lg">{t("wiz.list.removeBody", { name: w.removing?.name ?? "" })}</p>
      </Dialog>
    </div>
  );
}
