"use client";

import { ArrowLeftIcon, CircleNotchIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useRef, type ComponentProps, type PointerEvent, type ReactNode } from "react";
import { useBackToClose } from "@/lib/app-history";
import { useT } from "@/lib/i18n";

const pressable =
  "group inline-flex items-center justify-center gap-3 rounded-full text-center font-bold max-md:gap-2 transition duration-300 ease-settle active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary: "bg-wax text-snow shadow-cta hover:bg-wax-deep",
  gold: "bg-gold text-ink hover:bg-[#ecca80]",
  ghost: "bg-transparent text-current ring-2 ring-current/60 hover:bg-current/10 max-md:min-h-tap",
};

const sizes = {
  md: "min-h-tap text-base",
  lg: "min-h-tap-lg text-lg",
};

type Variant = keyof typeof variants;
type Size = keyof typeof sizes;
type Shape = { variant?: Variant; size?: Size; icon?: ReactNode; fit?: boolean };

/** Primary actions are 56px and everything else at least 48px. Full width on phones unless `fit`. */
export function buttonClass({ variant = "primary", size, icon, fit }: Shape, extra = "") {
  const resolved = size ?? (variant === "ghost" ? "md" : "lg");
  return `${pressable} ${variants[variant]} ${sizes[resolved]} ${icon ? "py-1.5 pr-2 pl-6 max-md:pl-4" : "px-6 py-2 max-md:px-4"} ${fit ? "" : "max-md:w-full"} ${extra}`;
}

function TrailingIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 max-md:size-8 transition duration-300 ease-settle group-hover:translate-x-0.5">
      {children}
    </span>
  );
}

type ButtonProps = ComponentProps<"button"> & Shape & { busy?: boolean };

export function Button({ variant, size, icon, fit, busy, className = "", children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || busy} aria-busy={busy} className={buttonClass({ variant, size, icon, fit }, className)} {...rest}>
      {busy && <CircleNotchIcon aria-hidden size={22} className="shrink-0 animate-spin" />}
      {children}
      {icon && !busy && <TrailingIcon>{icon}</TrailingIcon>}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & Shape;

export function LinkButton({ variant, size, icon, fit, className = "", children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClass({ variant, size, icon, fit }, className)} {...rest}>
      {children}
      {icon && <TrailingIcon>{icon}</TrailingIcon>}
    </Link>
  );
}

/** Cream letter in a thin tray: the surface all family-facing content sits on. */
export function Paper({ className = "", children, style }: { className?: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-card bg-white/8 p-1.5 shadow-card ring-1 ring-white/12 ${className}`} style={style}>
      <div className="paper h-full rounded-[calc(var(--radius-card)-0.375rem)] bg-paper p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] max-md:p-4 lg:p-8">
        {children}
      </div>
    </div>
  );
}

/** The quieter sibling of Paper, for things that support the page rather than lead it. */
export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-card bg-pine-800/90 p-6 shadow-card ring-1 ring-white/20 max-md:p-4 ${className}`}>{children}</div>;
}

export const inputClass =
  "min-h-tap-lg w-full min-w-0 rounded-field border-0 bg-white px-4 py-2 text-lg text-ink ring-2 ring-ink/45 transition duration-200 ease-settle placeholder:text-ink-soft/70 focus:ring-wax-deep aria-invalid:ring-wax";

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
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <label htmlFor={id} className="text-lg font-bold">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": helper || error ? noteId : undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={noteId} className="flex items-start gap-2 text-base font-bold text-wax-deep">
          <WarningCircleIcon aria-hidden size={24} weight="fill" className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : (
        helper && (
          <p id={noteId} className="text-base text-ink-soft max-md:text-sm">
            {helper}
          </p>
        )
      )}
    </div>
  );
}

export function ErrorNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={`flex items-start gap-2 rounded-tile bg-[#f8e4dd] px-4 py-4 text-base font-bold text-wax-deep max-md:py-2 ${className}`}>
      <WarningCircleIcon aria-hidden className="mt-0.5 shrink-0" size={24} weight="fill" />
      <span>{children}</span>
    </p>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative overflow-hidden rounded-tile bg-white/10 ${className}`}>
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    </div>
  );
}

const DRAG_TO_CLOSE_PX = 80;

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** False when closing by accident would lose something, like a one-time code. */
  dismissible?: boolean;
};

/** A bottom sheet on phones and a centered dialog above that. Native, so focus trapping and Escape are free. */
export function Dialog({ open, title, onClose, children, footer, dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const dragStart = useRef<number | null>(null);
  const t = useT();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useBackToClose(open && dismissible, onClose);

  const dragDistance = (event: PointerEvent) => Math.max(0, event.clientY - (dragStart.current ?? event.clientY));

  function endDrag(event: PointerEvent) {
    const distance = dragDistance(event);
    dragStart.current = null;
    if (ref.current) ref.current.style.transform = "";
    if (distance > DRAG_TO_CLOSE_PX) onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      onClick={(event) => {
        // The dialog has no padding of its own, so only a tap on the backdrop lands here.
        if (dismissible && event.target === ref.current) onClose();
      }}
      aria-label={title}
      className="paper mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-card bg-paper text-ink md:m-auto md:w-[calc(100%-4rem)] md:max-w-xl md:rounded-card"
    >
      {open && (
        <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-md:p-4 max-md:pt-0 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] md:p-8">
          {dismissible && (
            <div
              aria-hidden
              className="-mx-4 flex h-6 touch-none cursor-grab items-center justify-center md:hidden"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragStart.current = event.clientY;
              }}
              onPointerMove={(event) => {
                if (dragStart.current !== null && ref.current) ref.current.style.transform = `translateY(${dragDistance(event)}px)`;
              }}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span className="h-2 w-16 rounded-full bg-ink/40" />
            </div>
          )}
          <div className="flex items-start justify-between gap-4 max-md:mt-2">
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                className="-mt-2 -mr-2 flex min-h-tap shrink-0 items-center gap-2 rounded-full px-4 text-base font-bold ring-2 ring-ink/30 hover:bg-ink/10"
              >
                <XIcon aria-hidden size={20} />
                {t("common.close")}
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-4 text-ink-soft max-md:mt-2 max-md:gap-2">{children}</div>
          {footer && <div className="mt-6 flex flex-col-reverse gap-4 max-md:mt-4 max-md:gap-2 md:flex-row md:justify-end">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

type PageShellProps = {
  children: ReactNode;
  slug?: string;
  narrow?: boolean;
  /** For pages inside the phone frame, whose tabs already lead home. */
  backOnWideOnly?: boolean;
};

export function PageShell({ children, slug, narrow, backOnWideOnly }: PageShellProps) {
  const t = useT();
  return (
    <div className={`safe-top mx-auto w-full px-4 pb-16 sm:px-6 ${narrow ? "max-w-2xl" : "max-w-page"} ${backOnWideOnly ? "max-md:pt-4 max-md:pb-6" : ""}`}>
      <header className={`mb-8 flex min-h-tap items-center justify-between max-md:mb-4 ${backOnWideOnly ? "max-md:hidden" : ""}`}>
        {slug ? (
          <Link href={`/x/${slug}`} className="-ml-2 flex min-h-tap items-center gap-2 rounded-full px-2 text-lg font-bold text-gold">
            <ArrowLeftIcon aria-hidden size={22} />
            {t("common.backHome")}
          </Link>
        ) : (
          <Link href="/" className="flex min-h-tap items-center font-display text-xl font-semibold text-gold">
            Santa&apos;s Sealed Envelopes
          </Link>
        )}
      </header>
      {children}
    </div>
  );
}
