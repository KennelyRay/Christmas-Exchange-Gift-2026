"use client";

import { CheckCircleIcon, EnvelopeOpenIcon, EnvelopeSimpleIcon, LockKeyIcon, LockKeyOpenIcon, TelevisionIcon, XIcon } from "@phosphor-icons/react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { formatManila, fromManilaInputValue, toManilaInputValue } from "@/lib/christmas";
import { api, ClientApiError, errorMessage } from "@/lib/client-api";
import { formatPeso, parsePesoToCentavos } from "@/lib/money";
import type { DashboardView } from "@/lib/types";
import { CodeGate } from "./code-gate";
import { SecretCode } from "./secret-code";
import { Button, Dialog, ErrorNote, Field, inputClass, LinkButton, Paper } from "./ui";

const MIN_PEOPLE = 3;

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <Paper>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        {note && <p className="mt-1 text-ink-soft">{note}</p>}
        <div className="mt-5">{children}</div>
      </Paper>
    </section>
  );
}

type Confirmation = "lock" | "reopen" | "draw" | "reset" | "seal";

function SettingsForm({ dashboard, onSave }: { dashboard: DashboardView; onSave: (body: object) => Promise<boolean> }) {
  const [budget, setBudget] = useState(dashboard.budgetCentavos === null ? "" : String(dashboard.budgetCentavos / 100));
  const [revealAt, setRevealAt] = useState(toManilaInputValue(dashboard.revealAt));
  const [budgetError, setBudgetError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    setBudgetError("");
    const budgetCentavos = budget.trim() ? parsePesoToCentavos(budget) : null;
    if (budget.trim() && !budgetCentavos) {
      setBudgetError("Enter an amount like 1000 or 1,500.50");
      return;
    }
    setBusy(true);
    const succeeded = await onSave({ budgetCentavos, revealAt: fromManilaInputValue(revealAt).toISOString() });
    setBusy(false);
    setSaved(succeeded);
  }

  return (
    <form onSubmit={save} noValidate className="grid gap-4">
      <Field label="Suggested budget (₱)" helper="Leave empty for no suggestion." error={budgetError}>
        {(props) => <input {...props} value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" className={inputClass} />}
      </Field>
      <Field label="Christmas Night (Manila time)" helper="Changes appear in the public log. Frozen once you run the draw.">
        {(props) => <input {...props} type="datetime-local" value={revealAt} onChange={(e) => setRevealAt(e.target.value)} className={inputClass} />}
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="ghost" busy={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
        {saved && <span role="status" className="text-lg font-bold text-pine-700">Saved</span>}
      </div>
    </form>
  );
}

function RulesEditor({ dashboard, locked, onSave }: { dashboard: DashboardView; locked: boolean; onSave: (pairs: Array<[string, string]>) => Promise<boolean> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [feasible, setFeasible] = useState(true);
  const nameOf = (id: string) => dashboard.participants.find((p) => p.id === id)?.name ?? "Unknown";

  const toggle = (id: string) => setSelected((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id]));

  async function save(pairs: Array<[string, string]>) {
    setFeasible(await onSave(pairs));
  }

  // Same-family pairs are already blocked by the automatic rule.
  const familyOf = (id: string) => dashboard.participants.find((p) => p.id === id)?.familyKey;
  const newPairs: Array<[string, string]> = selected.flatMap((a, i) =>
    selected
      .slice(i + 1)
      .filter((b) => familyOf(a) !== familyOf(b))
      .map((b): [string, string] => [a, b]),
  );

  async function addGroup() {
    await save([...dashboard.exclusions, ...newPairs]);
    setSelected([]);
  }

  return (
    <div className="grid gap-5">
      {dashboard.participants.length < 2 ? (
        <p className="text-ink-soft">Rules become available once at least two people have joined.</p>
      ) : (
        !locked && (
          <div>
            <p className="mb-2 text-lg font-bold">Tap everyone in a couple or household</p>
            <div className="flex flex-wrap gap-2">
              {dashboard.participants.map((person) => {
                const active = selected.includes(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(person.id)}
                    className={`min-h-tap max-w-full rounded-full px-4 py-2 font-bold wrap-anywhere ring-2 transition duration-200 ease-settle active:scale-[0.98] ${active ? "bg-pine-800 text-snow ring-pine-800" : "ring-ink/40 hover:bg-ink/5"}`}
                  >
                    {person.name}
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" onClick={addGroup} disabled={newPairs.length === 0} className="mt-3">
              They can&apos;t draw each other
            </Button>
            {selected.length >= 2 && newPairs.length === 0 && (
              <p className="mt-2 text-sm text-ink-soft">They share a last name, so this rule is already automatic.</p>
            )}
          </div>
        )
      )}

      {!feasible && <ErrorNote>With these rules, no single gift chain is possible. Remove a rule before running the draw.</ErrorNote>}

      {dashboard.exclusions.length > 0 ? (
        <ul className="divide-y divide-ink/10">
          {dashboard.exclusions.map(([a, b]) => (
            <li key={`${a}-${b}`} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 wrap-anywhere">
                <strong>{nameOf(a)}</strong> and <strong>{nameOf(b)}</strong>
              </span>
              {!locked && (
                <button
                  type="button"
                  aria-label={`Remove the rule for ${nameOf(a)} and ${nameOf(b)}`}
                  onClick={() => void save(dashboard.exclusions.filter(([x, y]) => x !== a || y !== b))}
                  className="flex min-h-tap shrink-0 items-center gap-2 rounded-full px-4 font-bold ring-2 ring-ink/30 hover:bg-ink/10"
                >
                  <XIcon aria-hidden size={18} />
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">No extra rules yet. Only the automatic family rule applies.</p>
      )}
    </div>
  );
}

export function OrganizerClient({ slug, initial }: { slug: string; initial: DashboardView | null }) {
  const [dashboard, setDashboard] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const [reason, setReason] = useState("");
  const [reissueTarget, setReissueTarget] = useState<{ id: string; name: string } | null>(null);
  const [issuedCode, setIssuedCode] = useState<{ name: string; elfCode: string } | null>(null);
  const performing = useRef(false);

  const base = `/api/exchanges/${slug}/organizer`;

  async function reload() {
    setDashboard(await api<DashboardView>(base));
  }

  async function perform(action: () => Promise<unknown>) {
    if (performing.current) return false;
    performing.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await reload();
      return true;
    } catch (caught) {
      if (caught instanceof ClientApiError && caught.status === 401) setDashboard(null);
      setError(errorMessage(caught));
      return false;
    } finally {
      performing.current = false;
      setBusy(false);
      setConfirming(null);
    }
  }

  if (!dashboard) {
    return (
      <div className="grid gap-6">
        <header className="rise">
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">Organizer sign-in</h1>
          <p className="mt-3 text-snow-soft">You run the exchange, but you&apos;ll never see who got whom.</p>
        </header>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Paper>
          <CodeGate slug={slug} onSuccess={reload} />
        </Paper>
      </div>
    );
  }

  const { status } = dashboard;
  const isDrawn = status === "drawn";
  const count = dashboard.participants.length;
  const opened = dashboard.participants.filter((p) => p.hasOpened).length;

  const confirmations: Record<Confirmation, { title: string; body: ReactNode; action: string; run: () => Promise<unknown> }> = {
    lock: {
      title: "Lock the pool?",
      body: (
        <>
          <p>Nobody else can join after this. You can reopen it any time before the draw.</p>
          {dashboard.drawCheck && <ErrorNote>{dashboard.drawCheck.message}</ErrorNote>}
        </>
      ),
      action: "Lock the pool",
      run: () => api(`${base}/pool`, { body: { action: "lock" } }),
    },
    reopen: {
      title: "Reopen the pool?",
      body: <p>People can add wishlists again. This appears in the public log.</p>,
      action: "Reopen the pool",
      run: () => api(`${base}/pool`, { body: { action: "reopen" } }),
    },
    draw: {
      title: "Run the draw?",
      body: (
        <p>
          The result is sealed the moment you press this, and Christmas Night freezes at {formatManila(dashboard.revealAt)}. You
          won&apos;t see who got whom.
        </p>
      ),
      action: "Run the draw",
      run: () => api(`${base}/draw`, { body: {} }),
    },
    reset: {
      title: "Reset the draw?",
      body: <p>Every envelope is destroyed and the whole family sees this, along with your reason, in the public log.</p>,
      action: "Reset the draw",
      run: async () => {
        await api(`${base}/draw`, { method: "DELETE", body: { reason } });
        setReason("");
      },
    },
    seal: {
      title: "Open the seal?",
      body: <p>This publishes the full list of who got whom, for everyone, permanently.</p>,
      action: "Open the seal",
      run: () => api(`${base}/seal`, { body: {} }),
    },
  };

  const active = confirming ? confirmations[confirming] : null;

  return (
    <div className="grid gap-6">
      <header className="rise">
        <h1 className="font-display text-4xl leading-tight font-semibold wrap-anywhere sm:text-5xl">{dashboard.name}</h1>
        <p className="mt-3 text-snow-soft">
          {status === "open" && "Waiting for wishlists. Lock the pool when everyone is in."}
          {status === "locked" && "The pool is locked. Set any rules, then run the draw."}
          {isDrawn && `The draw is sealed. ${opened} of ${count} envelopes opened so far.`}
        </p>
      </header>

      {error && (
        <div className="sticky top-3 z-10">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <Section title={`Who's joined (${count})`} note="Lost codes can be replaced here. Everyone will see that you did it.">
        {count === 0 ? (
          <p className="text-ink-soft">Nobody has joined yet. Share the link with the family.</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {dashboard.participants.map((person) => (
              <li key={person.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                {isDrawn &&
                  (person.hasOpened ? (
                    <EnvelopeOpenIcon aria-hidden size={26} className="shrink-0 text-pine-700" />
                  ) : (
                    <EnvelopeSimpleIcon aria-hidden size={26} className="shrink-0 text-ink-soft" />
                  ))}
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-lg font-bold wrap-anywhere">{person.name}</p>
                  {isDrawn && <p className="text-base text-ink-soft">{person.hasOpened ? "Opened" : "Not opened yet"}</p>}
                </div>
                <Button variant="ghost" fit onClick={() => setReissueTarget(person)} className="shrink-0">
                  New code
                </Button>
              </li>
            ))}
          </ul>
        )}

        {!isDrawn && (
          <div className="mt-5">
            {status === "open" ? (
              <>
                <Button onClick={() => setConfirming("lock")} disabled={count < MIN_PEOPLE || dashboard.drawCheck?.blocksLock} icon={<LockKeyIcon aria-hidden size={18} />}>
                  Lock the pool
                </Button>
                {count < MIN_PEOPLE && <p className="mt-2 text-sm text-ink-soft">The draw needs at least {MIN_PEOPLE} people.</p>}
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming("reopen")}>
                <LockKeyOpenIcon aria-hidden size={20} />
                Reopen the pool
              </Button>
            )}
          </div>
        )}
      </Section>

      <Section title="Who can't draw whom" note="People with the same last name never draw each other. Add extra rules here, like spouses with different last names.">
        <RulesEditor
          dashboard={dashboard}
          locked={isDrawn}
          onSave={async (pairs) => {
            let feasible = true;
            await perform(async () => {
              ({ feasible } = await api<{ feasible: boolean }>(`${base}/exclusions`, { method: "PUT", body: { pairs } }));
            });
            return feasible;
          }}
        />
      </Section>

      {!isDrawn && (
        <Section title="Settings">
          <SettingsForm dashboard={dashboard} onSave={(body) => perform(() => api(base, { method: "PATCH", body }))} />
        </Section>
      )}

      <Section title="The draw">
        {!isDrawn ? (
          <>
            {dashboard.drawCheck && <ErrorNote className="mb-4">{dashboard.drawCheck.message}</ErrorNote>}
            <Button onClick={() => setConfirming("draw")} disabled={status !== "locked" || busy || dashboard.drawCheck !== null}>
              Run the draw
            </Button>
            {status === "open" && <p className="mt-2 text-sm text-ink-soft">Lock the pool first.</p>}
          </>
        ) : (
          <div className="grid gap-4">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircleIcon aria-hidden size={22} className="text-pine-700" />
              Draw #{dashboard.drawGeneration} is sealed
            </p>
            <p className="font-mono text-xs leading-relaxed break-all text-ink-soft">{dashboard.commitmentHash}</p>

            {dashboard.canResetDraw ? (
              <div className="grid gap-3 border-t border-ink/10 pt-4">
                <Field label="Need a full reset?" helper="Only if something went wrong, such as someone joining late. Your reason is public.">
                  {(props) => <input {...props} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason for the reset" className={inputClass} />}
                </Field>
                <div>
                  <Button variant="ghost" onClick={() => setConfirming("reset")} disabled={reason.trim().length < 3}>
                    Reset the draw
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">The reveal has started, so this draw can no longer be reset.</p>
            )}
          </div>
        )}
      </Section>

      <Section title="Christmas Night" note={`The Gift Chain opens ${formatManila(dashboard.revealAt)} (Manila time).`}>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={`/x/${slug}/chain`} icon={<TelevisionIcon aria-hidden size={18} />}>
            Open the Gift Chain
          </LinkButton>
          {!dashboard.sealOpened && (
            <Button variant="ghost" onClick={() => setConfirming("seal")} disabled={!dashboard.canOpenSeal}>
              Open the seal
            </Button>
          )}
        </div>
        {dashboard.sealOpened ? (
          <p className="mt-3 text-sm text-ink-soft">The seal is open. Anyone can verify the draw from the seal page.</p>
        ) : (
          !dashboard.canOpenSeal && <p className="mt-3 text-sm text-ink-soft">The seal opens after the Gift Chain finishes, or a day after Christmas Night.</p>
        )}
      </Section>

      <Dialog
        open={active !== null}
        title={active?.title ?? ""}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button busy={busy} onClick={() => active && void perform(active.run)}>
              {busy ? "Working…" : active?.action}
            </Button>
          </>
        }
      >
        {active?.body}
      </Dialog>

      <Dialog
        open={reissueTarget !== null && issuedCode === null}
        title={`New code for ${reissueTarget?.name ?? ""}?`}
        onClose={() => setReissueTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReissueTarget(null)}>
              Cancel
            </Button>
            <Button
              busy={busy}
              onClick={async () => {
                const target = reissueTarget;
                if (!target) return;
                let result: { name: string; elfCode: string } | null = null;
                await perform(async () => {
                  result = await api<{ name: string; elfCode: string }>(`${base}/participants/${target.id}/code`, { body: {} });
                });
                setReissueTarget(null);
                setIssuedCode(result);
              }}
            >
              {busy ? "Working…" : "Issue a new code"}
            </Button>
          </>
        }
      >
        <p>Their old code stops working right away. The whole family will see in the log that you issued this.</p>
        <p>Give the code straight to them, and don&apos;t use it yourself: it would open their envelope.</p>
      </Dialog>

      <Dialog open={issuedCode !== null} title={`New code for ${issuedCode?.name ?? ""}`} onClose={() => setIssuedCode(null)} dismissible={false}>
        {issuedCode && (
          <SecretCode
            label="New Elf Code"
            code={issuedCode.elfCode}
            explanation="Pass this on privately. It won't be shown again."
            confirmLabel="I've passed it on"
            doneLabel="Done"
            ownerName={issuedCode.name}
            exchangeName={dashboard.name}
            sendLabel="Send it to them"
            sendText={`Your new secret code (Elf Code) for ${dashboard.name}: ${issuedCode.elfCode}. Keep this private!`}
            onDone={() => setIssuedCode(null)}
          />
        )}
      </Dialog>

      {dashboard.budgetCentavos !== null && isDrawn && (
        <p className="text-base">Suggested budget: {formatPeso(dashboard.budgetCentavos)}</p>
      )}
    </div>
  );
}
