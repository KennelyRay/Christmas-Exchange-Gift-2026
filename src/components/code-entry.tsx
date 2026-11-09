"use client";

export const CODE_LENGTH = 6;

type CodeEntryProps = {
  value: string;
  onChange: (value: string) => void;
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * Six big boxes over one real input, so paste, the numeric keypad, and screen
 * readers all behave normally. It never submits by itself: wrong guesses are
 * limited per hour, and a typo shouldn't cost one.
 */
export function CodeEntry({ value, onChange, ...field }: CodeEntryProps) {
  return (
    <div className="group relative mx-auto w-full max-w-md">
      <div aria-hidden className="grid grid-cols-[repeat(auto-fit,minmax(2.25rem,1fr))] gap-2">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <span
            key={index}
            className={`flex min-h-[4.5rem] items-center justify-center rounded-field bg-white font-display text-4xl font-semibold text-ink tabular-nums ring-2 max-md:ring-0 ${
              index === Math.min(value.length, CODE_LENGTH - 1) ? "ring-ink/45 group-focus-within:ring-4 group-focus-within:ring-wax-deep max-md:group-focus-within:ring-2 max-md:group-focus-within:ring-gold" : "ring-ink/45"
            }`}
          >
            {value[index] ?? ""}
          </span>
        ))}
      </div>
      <input
        {...field}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        className="absolute inset-0 size-full cursor-pointer rounded-field opacity-0"
      />
    </div>
  );
}
