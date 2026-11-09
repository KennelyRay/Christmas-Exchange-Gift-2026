"use client";

import { ArrowLeftIcon, CaretRightIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { goBack, historyDepth, pushEntry, replaceEntry, useBackToClose, whenHistorySettled } from "@/lib/app-history";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { formatPeso, parsePesoToCentavos } from "@/lib/money";
import { MAX_ITEMS } from "@/lib/validation";
import { SecretCode } from "./secret-code";
import { Button, Dialog, ErrorNote, Field, inputClass } from "./ui";
import { isBlank, TOTAL_STEPS, type Draft, type Step, type WishlistWizard } from "./use-wishlist-wizard";
import { ItemSummary, PhotoPicker, PriceInput, StoreLinkField } from "./wishlist-fields";

type Props = { wizard: WishlistWizard; heading: React.RefObject<HTMLHeadingElement | null>; slug: string; budgetCentavos: number | null; exchangeName: string };

const query = (step: Step, editing: boolean) => `?step=${step}${editing ? "&item=1" : ""}`;

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
    <button type="button" onClick={onOpen} className="flex min-h-row w-full min-w-0 shrink-0 items-center gap-4 text-left">
      <span className="min-w-0 flex-1 text-base leading-snug font-semibold wrap-anywhere">{item.name}</span>
      {centavos !== null && <span className="shrink-0 text-base tabular-nums">{formatPeso(centavos)}</span>}
      <CaretRightIcon aria-hidden size={20} className="shrink-0" />
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

export function MobileWishlist({ wizard: w, heading, slug, budgetCentavos, exchangeName }: Props) {
  const router = useRouter();
  const t = useT();
  const [leaving, setLeaving] = useState(false);
  const [viewing, setViewing] = useState<Draft | null>(null);
  const [extras, setExtras] = useState(false);
  const back = useWizardHistory(w);
  useBackToClose(extras, () => setExtras(false));

  const { step, items, editor, errors } = w;
  const home = `/x/${slug}`;

  if (w.elfCode) {
    return (
      <div className="app-screen">
        <main className="animate-soft gutter flex min-h-0 flex-1 flex-col gap-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <h1 className="shrink-0 font-display text-3xl font-semibold">{t("code.plainTitle")}</h1>
          <SecretCode
            plain
            label={t("code.label")}
            code={w.elfCode}
            explanation={t("code.plainNote")}
            confirmLabel={t("code.confirm")}
            doneLabel={t("code.done")}
            ownerName={w.fullName}
            exchangeName={exchangeName}
            onDone={() => router.push(home)}
          />
        </main>
      </div>
    );
  }

  const inItemForm = step >= 2 && w.editing && editor !== null;
  const showExtras = inItemForm && extras;
  const isSavedItem = editor !== null && items.some((item) => item.key === editor.key);
  const itemNumber = editor === null ? 0 : isSavedItem ? items.findIndex((item) => item.key === editor.key) + 1 : items.length + 1;
  const hasExtras = editor !== null && Boolean(editor.imageUrl || editor.url.trim());

  const hasProgress = Boolean(w.firstName.trim() || w.lastName.trim() || items.length > 0 || (editor && !isBlank(editor)));
  const askToLeave = () => (hasProgress ? setLeaving(true) : router.push(home));

  const closeItem = () => {
    w.moved();
    w.setEditing(false);
  };

  const stepLabel = t("wiz.step", { n: step });
  const nextLabel: MessageKey = showExtras ? "common.done" : inItemForm ? "wiz.item.saveShort" : ({ 1: "wiz.next", 2: "wiz.list.next", 3: "wiz.review.next", 4: "wiz.confirm.yes" } as const)[step];
  const headerButton = "flex min-h-tap shrink-0 items-center gap-1 text-base";
  const blank = <span className="w-16" />;

  return (
    <div className="app-screen">
      <header className="gutter flex min-h-tap shrink-0 items-center justify-between gap-2 pt-[env(safe-area-inset-top)]">
        {inItemForm ? (
          <button type="button" onClick={showExtras ? () => setExtras(false) : closeItem} className={headerButton}>
            {showExtras ? <ArrowLeftIcon aria-hidden size={20} /> : <XIcon aria-hidden size={20} />}
            {t(showExtras ? "common.back" : "common.close")}
          </button>
        ) : step > 1 ? (
          <button type="button" onClick={back} className={headerButton}>
            <ArrowLeftIcon aria-hidden size={20} />
            {t("common.back")}
          </button>
        ) : (
          blank
        )}

        <p className="min-w-0 text-center text-base">{inItemForm ? t("wiz.item.heading", { n: itemNumber }) : stepLabel}</p>

        {inItemForm ? (
          isSavedItem && !showExtras ? (
            <button type="button" onClick={() => w.setRemoving(editor)} className={headerButton}>
              <TrashIcon aria-hidden size={20} />
              {t("common.remove")}
            </button>
          ) : (
            blank
          )
        ) : (
          <button type="button" onClick={askToLeave} className={headerButton}>
            <XIcon aria-hidden size={20} />
            {t("common.close")}
          </button>
        )}
      </header>

      <form
        onSubmit={(event) => {
          if (showExtras) {
            event.preventDefault();
            setExtras(false);
          } else {
            w.advance(event);
          }
        }}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <div key={`${step}-${inItemForm}-${showExtras}`} className="animate-soft gutter flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain pt-6 pb-2">
          {showExtras && editor && (
            <div className="grid shrink-0 gap-8">
              <PhotoPicker compact slug={slug} imageUrl={editor.imageUrl} onChange={(imageUrl) => w.updateEditor({ imageUrl })} onBusy={w.setPhotoBusy} />
              <StoreLinkField compact value={editor.url} error={errors.url} onChange={(url) => w.updateEditor({ url })} />
            </div>
          )}

          {inItemForm && !showExtras && editor && (
            <div className="grid shrink-0 gap-6">
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
              <Button variant="text" fit onClick={() => setExtras(true)} className="justify-self-start text-left">
                {t(hasExtras ? "wiz.extras.added" : "wiz.extras")}
              </Button>
              {errors.url && <ErrorNote>{errors.url}</ErrorNote>}
            </div>
          )}

          {!inItemForm && step === 1 && (
            <>
              <Title headingRef={heading}>{t("wiz.name.title")}</Title>
              <div className="grid shrink-0 gap-6">
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
                <Field label={t("wiz.last")} error={errors.lastName} helper={t("wiz.familyShort")}>
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
              </div>
            </>
          )}

          {!inItemForm && step === 2 && (
            <>
              <div className="shrink-0">
                <Title headingRef={heading}>{t("wiz.items.title")}</Title>
                {budgetCentavos !== null && <p className="mt-2 text-base">{t("wiz.items.budget", { amount: formatPeso(budgetCentavos) })}</p>}
              </div>
              {items.length > 0 && (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                  {items.map((item) => (
                    <CompactItem key={item.key} item={item} onOpen={() => w.openEditor(item)} />
                  ))}
                </div>
              )}
              {items.length < MAX_ITEMS && (
                <Button variant="ghost" size="lg" onClick={w.addAnother} className="w-full shrink-0">
                  <PlusIcon aria-hidden size={20} className="shrink-0" />
                  {t("wiz.list.addItem")}
                </Button>
              )}
            </>
          )}

          {!inItemForm && step === 3 && (
            <>
              <div className="shrink-0">
                <Title headingRef={heading}>{t("wiz.review.title")}</Title>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <p className="min-w-0 text-base font-semibold wrap-anywhere">{w.fullName}</p>
                  <Button variant="text" fit onClick={() => w.goTo(1)} className="shrink-0">
                    {t("wiz.review.change")}
                  </Button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                {items.map((item) => (
                  <CompactItem key={item.key} item={item} onOpen={() => setViewing(item)} />
                ))}
              </div>
              {w.total > 0 && (
                <p className="shrink-0 text-sm">
                  {t("wiz.list.total")}: {formatPeso(w.total)}
                </p>
              )}
            </>
          )}

          {!inItemForm && step === 4 && (
            <div className="flex flex-[1_0_auto] flex-col justify-center">
              <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-semibold outline-none">
                {t("wiz.confirm.ready")}
              </h1>
              <p className="mt-4 text-base">{t("wiz.confirm.final")}</p>
              <p className="mt-2 text-base wrap-anywhere">{items.length === 1 ? t("wiz.confirm.summary1", { name: w.fullName }) : t("wiz.confirm.summary", { name: w.fullName, n: items.length })}</p>
            </div>
          )}

          {w.formError && <ErrorNote className="shrink-0">{w.formError}</ErrorNote>}
        </div>

        <div className="gutter grid shrink-0 gap-2 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Button type="submit" busy={w.busy} disabled={w.photoBusy} className="w-full">
            {w.busy ? t("wiz.confirm.busy") : w.photoBusy ? t("wiz.item.uploading") : t(nextLabel)}
          </Button>
          {!inItemForm && step === 4 && (
            <Button variant="text" fit disabled={w.busy} onClick={back} className="justify-self-start">
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
        <p className="text-base">{t("wiz.leave.body")}</p>
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
        <p className="text-base">{t("wiz.list.removeBody", { name: w.removing?.name ?? "" })}</p>
      </Dialog>
    </div>
  );
}
