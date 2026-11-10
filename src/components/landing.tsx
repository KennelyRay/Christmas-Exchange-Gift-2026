"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { defaultRevealAt, fromManilaInputValue, toManilaInputValue } from "@/lib/christmas";
import { api, ClientApiError, errorMessage } from "@/lib/client-api";
import { slugFromLink } from "@/lib/exchange-link";
import { parsePesoToCentavos } from "@/lib/money";
import { SecretCode } from "./secret-code";
import { Button, ErrorNote, Field, inputClass, Paper } from "./ui";
import { WaxSeal } from "./wax-seal";

function FindExchange({ onOrganizer }: { onOrganizer: () => void }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  function go(event: FormEvent) {
    event.preventDefault();
    const slug = slugFromLink(link);
    if (!slug) {
      setError("Paste the link your family sent you");
      return;
    }
    router.push(`/x/${encodeURIComponent(slug)}`);
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={go} noValidate className="grid gap-5">
        <h1 className="font-display text-3xl leading-tight font-semibold sm:text-4xl">Find your exchange</h1>

        <Field label="Exchange link" helper="Paste the link your family sent you." error={error}>
          {(props) => (
            <input
              {...props}
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setError("");
              }}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="merry-reindeer-47"
              className={inputClass}
            />
          )}
        </Field>

        <Button type="submit" className="w-full" icon={<ArrowRightIcon aria-hidden size={18} />}>
          Open the exchange
        </Button>
      </form>

      <div className="border-t border-ink/15 pt-6">
        <Button variant="ghost" onClick={onOrganizer} className="w-full">
          Are you the organizer?
        </Button>
      </div>
    </div>
  );
}

function CreateExchange({ onBack }: { onBack: () => void }) {
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

  if (created) {
    return (
      <>
        <h1 className="mb-1 font-display text-3xl font-semibold">Your exchange is ready</h1>
        <p className="mb-5 text-ink-soft">This code is what lets you close joining and run the draw. Keep it to yourself.</p>
        <SecretCode
          label="Organizer Code"
          code={created.organizerCode}
          explanation="We only keep a scrambled copy, so this is the one time you'll see it. There's no way to recover it later."
          confirmLabel="I saved my Organizer Code"
          doneLabel="Open our exchange"
          exchangeName={name}
          sendText={`Organizer Code for ${name}: ${created.organizerCode}. Keep this private!`}
          onDone={() => router.push(`/x/${created.slug}`)}
        />
      </>
    );
  }

  return (
    <form onSubmit={create} className="grid gap-5" noValidate>
      <button type="button" onClick={onBack} className="-ml-2 flex min-h-tap w-fit items-center gap-2 rounded-full px-2 text-lg font-bold">
        <ArrowLeftIcon aria-hidden size={22} />
        Back
      </button>

      <h1 className="font-display text-3xl font-semibold">Start your exchange</h1>

      <Field label="What's it called?" error={errors.name}>
        {(props) => (
          // Opened by a deliberate tap, so moving focus and raising the keyboard is expected.
          <input {...props} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Our Family Christmas 2026" maxLength={60} className={inputClass} />
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
        {busy ? "Creating…" : "Create our exchange"}
      </Button>
    </form>
  );
}

export function Landing() {
  const [organizing, setOrganizing] = useState(false);

  return (
    <main className="safe-top safe-bottom mx-auto grid min-h-[100dvh] w-full max-w-page content-center items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-x-16">
      <Paper className="rise">
        {organizing ? <CreateExchange onBack={() => setOrganizing(false)} /> : <FindExchange onOrganizer={() => setOrganizing(true)} />}
      </Paper>

      <section className="rise max-w-xl" style={{ "--i": 2 } as React.CSSProperties}>
        <WaxSeal className="mb-6 size-20 sm:size-24" />
        <h2 className="font-display text-5xl leading-[0.98] font-semibold tracking-tight sm:text-7xl">
          Draw names.
          <br />
          Seal them.
          <br />
          <span className="text-gold">Tear one open.</span>
        </h2>
        <p className="mt-6 max-w-[46ch] text-xl">
          A gift exchange for your family where nobody, not even the organizer, knows who got whom until they break
          their own wax seal. :D
        </p>
      </section>
    </main>
  );
}
