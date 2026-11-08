"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { defaultRevealAt, fromManilaInputValue, toManilaInputValue } from "@/lib/christmas";
import { api, ClientApiError, errorMessage } from "@/lib/client-api";
import { parsePesoToCentavos } from "@/lib/money";
import { SecretCode } from "./secret-code";
import { Button, ErrorNote, Field, inputClass, Paper } from "./ui";
import { WaxSeal } from "./wax-seal";

function ExistingExchangeForm() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go(event: FormEvent) {
    event.preventDefault();
    const slug = value.trim().replace(/\/+$/, "").split("/").pop();
    if (slug) router.push(`/x/${slug}`);
  }

  return (
    <form onSubmit={go} className="max-w-md lg:col-start-1">
      <label htmlFor="existing" className="text-sm font-semibold text-gold">
        Already have an exchange? Paste its link
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="existing"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="merry-reindeer-47"
          className="min-h-12 w-full min-w-0 rounded-2xl border-0 bg-white/10 px-4 text-base text-snow ring-1 ring-white/30 placeholder:text-snow/60"
        />
        <Button type="submit" variant="gold">
          Go
        </Button>
      </div>
    </form>
  );
}

export function Landing() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [revealAt, setRevealAt] = useState(() => toManilaInputValue(defaultRevealAt(new Date())));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ slug: string; organizerCode: string } | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError("");

    const budgetCentavos = budget.trim() ? parsePesoToCentavos(budget) : null;
    if (budget.trim() && !budgetCentavos) {
      setErrors({ budgetCentavos: "Enter an amount like 1000 or 1,500.50" });
      return;
    }

    setBusy(true);
    try {
      setCreated(
        await api<{ slug: string; organizerCode: string }>("/api/exchanges", {
          body: { name, budgetCentavos, revealAt: fromManilaInputValue(revealAt).toISOString() },
        }),
      );
    } catch (error) {
      if (error instanceof ClientApiError && Object.keys(error.fields).length > 0) setErrors(error.fields);
      else setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-[100dvh] w-full max-w-6xl content-center items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-x-16">
      <section className="rise max-w-xl">
        <WaxSeal className="mb-6 size-20 sm:size-24" />
        <h1 className="font-display text-5xl leading-[0.98] font-semibold tracking-tight sm:text-7xl">
          Draw names.
          <br />
          Seal them.
          <br />
          <span className="text-gold">Tear one open.</span>
        </h1>
        <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-snow/85">
          A gift exchange for your family where nobody, not even the organizer, knows who got whom until they break
          their own wax seal.
        </p>
      </section>

      <Paper className="rise lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:rotate-1" style={{ "--i": 2 } as React.CSSProperties}>
        {created ? (
          <>
            <h2 className="mb-1 font-display text-3xl font-semibold">Your exchange is ready</h2>
            <p className="mb-5 text-ink-soft">This code is what lets you lock the pool and run the draw. Keep it to yourself.</p>
            <SecretCode
              label="Organizer Code"
              code={created.organizerCode}
              explanation="We only keep a scrambled copy, so this is the one time you'll see it. There's no way to recover it later."
              confirmLabel="I saved my Organizer Code"
              doneLabel="Open the pool"
              onDone={() => router.push(`/x/${created.slug}`)}
            />
          </>
        ) : (
          <form onSubmit={create} className="grid gap-5" noValidate>
            <h2 className="font-display text-3xl font-semibold">Start your exchange</h2>

            <Field label="What's it called?" error={errors.name}>
              {(props) => (
                <input {...props} value={name} onChange={(e) => setName(e.target.value)} placeholder="Our Family Christmas 2026" maxLength={60} className={inputClass} />
              )}
            </Field>

            <Field label="Suggested gift budget (optional)" helper="A hint for everyone. It isn't enforced." error={errors.budgetCentavos}>
              {(props) => <input {...props} value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="₱1,000" className={inputClass} />}
            </Field>

            <Field
              label="Christmas Night (Manila time)"
              helper="The Gift Chain stays locked until this moment, even for you. It can't change after the draw."
              error={errors.revealAt}
            >
              {(props) => <input {...props} type="datetime-local" value={revealAt} onChange={(e) => setRevealAt(e.target.value)} className={inputClass} />}
            </Field>

            {formError && <ErrorNote>{formError}</ErrorNote>}

            <Button type="submit" busy={busy} className="w-full" icon={<ArrowRightIcon aria-hidden size={18} />}>
              {busy ? "Sealing..." : "Create our exchange"}
            </Button>
          </form>
        )}
      </Paper>

      <ExistingExchangeForm />
    </main>
  );
}
