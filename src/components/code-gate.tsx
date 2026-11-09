"use client";

import { useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { Button, ErrorNote, Field, inputClass } from "./ui";

/** Trades the Organizer Code for a session cookie the browser can't read or leak. */
export function CodeGate({ slug, onSuccess }: { slug: string; onSuccess: () => void | Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setError("");
    setBusy(true);
    try {
      await api(`/api/exchanges/${slug}/organizer`, { body: { code } });
      await onSuccess();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Field label="Organizer Code" helper="The six words you saved when you created this exchange. Capitals and spaces don't matter.">
        {(props) => (
          <input {...props} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} className={inputClass} />
        )}
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" busy={busy} className="w-full">
        {busy ? "Checking…" : "Sign in"}
      </Button>
    </form>
  );
}
