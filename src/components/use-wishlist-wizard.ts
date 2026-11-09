"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { setDeviceValue } from "@/lib/hooks";
import { friendlyError, useT, type Translate } from "@/lib/i18n";
import { parsePesoToCentavos } from "@/lib/money";
import { fullNameOf } from "@/lib/names";
import { joinedNameKey } from "@/lib/stage";
import { normalizeWebUrl } from "@/lib/stores";
import { wishlistItemSchema, wishlistSubmissionSchema } from "@/lib/validation";

export type Draft = { key: string; name: string; price: string; url: string; imageUrl: string | null };
export type Step = 1 | 2 | 3 | 4;
export type Errors = Record<string, string>;

export const TOTAL_STEPS = 4;

export const newItem = (): Draft => ({ key: crypto.randomUUID(), name: "", price: "", url: "", imageUrl: null });
export const isBlank = (item: Draft) => !item.name.trim() && !item.price.trim() && !item.url.trim() && !item.imageUrl;

type SavedDraft = { firstName: string; lastName: string; items: Draft[]; editor: Draft | null; editing: boolean; step: Step };

function loadDraft(storageKey: string, autoOpenEditor: boolean): SavedDraft {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<SavedDraft> | null;
    if (saved) {
      const items = Array.isArray(saved.items) ? saved.items.filter((item) => !isBlank(item)) : [];
      const editing = autoOpenEditor ? (saved.editing ?? items.length === 0) : Boolean(saved.editing && saved.editor && !isBlank(saved.editor));
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
  return { firstName: "", lastName: "", items: [], editor: autoOpenEditor ? newItem() : null, editing: autoOpenEditor, step: 1 };
}

function itemErrorsOf(item: Draft, t: Translate) {
  const errors: Errors = {};
  if (!wishlistItemSchema.shape.name.safeParse(item.name).success) errors.name = t("err.itemName");

  if (item.price.trim()) {
    const centavos = parsePesoToCentavos(item.price);
    if (centavos === null || centavos <= 0) errors.price = t("err.price");
    else if (!wishlistItemSchema.shape.priceCentavos.safeParse(centavos).success) errors.price = t("err.priceHigh");
  }

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

/** Everything the wizard knows and does, shared by the phone and desktop layouts. */
export function useWishlistWizard({ slug, autoOpenEditor, heading }: { slug: string; autoOpenEditor: boolean; heading: RefObject<HTMLHeadingElement | null> }) {
  const t = useT();
  const storageKey = `wishlist-draft:${slug}`;

  const [draft] = useState(() => loadDraft(storageKey, autoOpenEditor));
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
  }, [heading, step, editing]);

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

  /** Opens one item without changing which step it will return to. */
  function openEditorInPlace(item: Draft, itemErrors: Errors = {}) {
    moved();
    setEditor(item);
    setEditing(true);
    setErrors(itemErrors);
  }

  function openEditor(item: Draft, itemErrors: Errors = {}) {
    openEditorInPlace(item, itemErrors);
    setStep(2);
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
    if (editor?.key === target.key) {
      setEditor(null);
      setEditing(false);
    }
    if (remaining.length === 0 && autoOpenEditor) openEditor(newItem());
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
    if (step >= 2 && editing) {
      saveItem();
    } else if (step === 1) {
      const found = nameErrorsOf(firstName, lastName, t);
      if (Object.keys(found).length > 0) setErrors(found);
      else goTo(2);
    } else if (step === 2) {
      if (everythingValid()) goTo(3);
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
          priceCentavos: parsePesoToCentavos(item.price),
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

  return {
    step,
    setStep,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    items,
    editor,
    editing,
    setEditing,
    photoBusy,
    setPhotoBusy,
    errors,
    formError,
    removing,
    setRemoving,
    busy,
    elfCode,
    fullName,
    total,
    moved,
    goTo,
    openEditor,
    openEditorInPlace,
    clearError,
    updateEditor,
    addAnother,
    move,
    confirmRemove,
    advance,
  };
}

export type WishlistWizard = ReturnType<typeof useWishlistWizard>;
