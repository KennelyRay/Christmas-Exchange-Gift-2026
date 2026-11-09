"use client";

import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, PencilSimpleIcon, PlusIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type RefObject } from "react";
import { isPhoneWidth, useIsPhoneWidth } from "@/lib/app-history";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { formatPeso, parsePesoToCentavos } from "@/lib/money";
import { MAX_ITEMS } from "@/lib/validation";
import { MobileWishlist } from "./mobile-wizard";
import { SecretCode } from "./secret-code";
import { Button, Dialog, ErrorNote, Field, inputClass, Paper } from "./ui";
import { TOTAL_STEPS, useWishlistWizard, type Step, type WishlistWizard } from "./use-wishlist-wizard";
import { ItemSummary, PhotoPicker, PriceInput, StepHeading, StoreLinkField } from "./wishlist-fields";

type Props = { slug: string; budgetCentavos: number | null; exchangeName: string };

/** One hook above both layouts, so turning a phone sideways can't lose a code shown once. */
export function WishlistForm(props: Props) {
  const [startedOnPhone] = useState(isPhoneWidth);
  const heading = useRef<HTMLHeadingElement>(null);
  const wizard = useWishlistWizard({ slug: props.slug, autoOpenEditor: !startedOnPhone, heading });
  return useIsPhoneWidth() ? <MobileWishlist wizard={wizard} heading={heading} {...props} /> : <DesktopWishlist wizard={wizard} heading={heading} {...props} />;
}

function DesktopWishlist({ wizard, heading, slug, budgetCentavos, exchangeName }: Props & { wizard: WishlistWizard; heading: RefObject<HTMLHeadingElement | null> }) {
  const router = useRouter();
  const t = useT();
  const {
    step, setStep, firstName, setFirstName, lastName, setLastName, items, editor, editing, setEditing, setPhotoBusy, photoBusy,
    errors, formError, removing, setRemoving, busy, elfCode, fullName, total, moved, goTo, openEditor, clearError,
    updateEditor, addAnother, move, confirmRemove, advance,
  } = wizard;

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
              {total > 0 && (
                <p className="text-lg">
                  {t("wiz.list.total")}: <strong className="font-display text-2xl font-semibold text-gold tabular-nums">{formatPeso(total)}</strong>
                </p>
              )}
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
                {total > 0 && (
                  <p className="mt-2 border-t-2 border-ink/15 pt-4 text-lg font-bold">
                    {t("wiz.list.total")}: <span className="text-wax-deep tabular-nums">{formatPeso(total)}</span>
                  </p>
                )}
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

        <div className="safe-x grid gap-2 pt-2 pb-8">
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
