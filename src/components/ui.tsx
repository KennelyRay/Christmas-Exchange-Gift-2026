"use client";

import { ArrowLeftIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";

const pressable =
  "inline-flex min-h-12 items-center justify-center gap-3 rounded-full font-semibold transition duration-300 ease-settle active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const variants = {
  primary: "bg-wax text-snow hover:bg-wax-deep shadow-[0_10px_24px_-12px_rgba(125,26,32,0.9)]",
  gold: "bg-gold text-ink hover:bg-[#ecca80]",
  ghost: "bg-transparent text-current ring-1 ring-current/40 hover:bg-current/10",
};

type Variant = keyof typeof variants;

function buttonClass(variant: Variant, hasIcon: boolean, extra = "") {
  return `${pressable} ${variants[variant]} ${hasIcon ? "py-1.5 pl-6 pr-1.5" : "px-6 py-2.5"} ${extra}`;
}

function TrailingIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-9 items-center justify-center rounded-full bg-white/15 transition duration-300 ease-settle group-hover:translate-x-0.5">
      {children}
    </span>
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; icon?: ReactNode; busy?: boolean };

export function Button({ variant = "primary", icon, busy, className = "", children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || busy} aria-busy={busy} className={`group ${buttonClass(variant, Boolean(icon), className)}`} {...rest}>
      {children}
      {icon && <TrailingIcon>{icon}</TrailingIcon>}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; icon?: ReactNode };

export function LinkButton({ variant = "primary", icon, className = "", children, ...rest }: LinkButtonProps) {
  return (
    <Link className={`group ${buttonClass(variant, Boolean(icon), className)}`} {...rest}>
      {children}
      {icon && <TrailingIcon>{icon}</TrailingIcon>}
    </Link>
  );
}

/** Cream letter in a thin tray: the surface all family-facing content sits on. */
export function Paper({ className = "", children, style }: { className?: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-[2rem] bg-white/8 p-1.5 ring-1 ring-white/12 ${className}`} style={style}>
      <div className="paper h-full rounded-[calc(2rem-0.375rem)] bg-paper p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] sm:p-8">
        {children}
      </div>
    </div>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-2xl border-0 bg-white/80 px-4 py-2.5 text-base text-ink ring-1 ring-ink/25 transition duration-200 ease-settle placeholder:text-ink-soft/80 focus:bg-white aria-invalid:ring-2 aria-invalid:ring-wax";

type FieldProps = {
  label: string;
  helper?: ReactNode;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
};

export function Field({ label, helper, error, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": helper || error ? noteId : undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={noteId} className="flex items-start gap-1.5 text-sm font-medium text-wax">
          <WarningCircleIcon aria-hidden className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : (
        helper && (
          <p id={noteId} className="text-sm text-ink-soft">
            {helper}
          </p>
        )
      )}
    </div>
  );
}

export function ErrorNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={`flex items-start gap-2 rounded-2xl bg-[#f8e4dd] px-4 py-3 text-sm font-medium text-wax-deep ${className}`}>
      <WarningCircleIcon aria-hidden className="mt-0.5 shrink-0" size={18} />
      <span>{children}</span>
    </p>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative overflow-hidden rounded-2xl bg-white/10 ${className}`}>
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    </div>
  );
}

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** False when closing by accident would lose something, like a one-time code. */
  dismissible?: boolean;
};

/** Native dialog: focus trapping and Escape come from the browser. */
export function Dialog({ open, title, onClose, children, footer, dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      aria-label={title}
      className="paper m-auto w-[calc(100%-2rem)] max-w-md rounded-[1.75rem] bg-paper p-6 text-ink backdrop:bg-pine-950/80 sm:p-8"
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-display text-2xl leading-tight font-semibold">{title}</h2>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label="Close" className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-ink/10">
                <XIcon size={20} />
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-3 text-ink-soft">{children}</div>
          {footer && <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function PageShell({ children, slug, narrow }: { children: ReactNode; slug?: string; narrow?: boolean }) {
  return (
    <div className={`mx-auto w-full px-4 pt-5 pb-16 sm:px-6 ${narrow ? "max-w-2xl" : "max-w-6xl"}`}>
      <header className="mb-8 flex min-h-11 items-center justify-between">
        {slug ? (
          <Link href={`/x/${slug}`} className="-ml-2 flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-gold">
            <ArrowLeftIcon aria-hidden size={18} />
            Back to the pool
          </Link>
        ) : (
          <Link href="/" className="flex min-h-11 items-center font-display text-lg font-semibold text-gold">
            Santa&apos;s Sealed Envelopes
          </Link>
        )}
      </header>
      {children}
    </div>
  );
}
