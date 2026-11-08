const OUTLINE =
  "M60 6c10 0 14 6 23 9s17 2 22 11 1 16 4 25 9 15 5 25-13 11-19 19-8 17-19 19-17-5-26-5-17 7-27 2-8-14-14-22-16-12-16-23 10-15 12-24-1-17 7-23 16-3 25-7 13-6 23-6z";

/** The app's motif: a red wax seal pressed with a four-point parol star. */
export function WaxSeal({ className = "", cracks = 0 }: { className?: string; cracks?: number }) {
  return (
    <svg viewBox="-8 -2 136 124" aria-hidden className={className}>
      <path d={OUTLINE} fill="#a3262b" />
      <path d={OUTLINE} fill="none" stroke="#c2413f" strokeWidth="2" opacity="0.7" />
      <circle cx="60" cy="60" r="35" fill="#8f2026" />
      <circle cx="60" cy="60" r="35" fill="none" stroke="#7d1a20" strokeWidth="3" />
      <path d="M60 32l6 22 22 6-22 6-6 22-6-22-22-6 22-6z" fill="#e0bb6b" />
      {cracks > 0 && <path d="M20 40l22 14-6 12 24 2" fill="none" stroke="#fbf4e6" strokeWidth="2.5" strokeLinecap="round" />}
      {cracks > 1 && <path d="M100 30L80 50l8 14-22 8-6 20" fill="none" stroke="#fbf4e6" strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}
