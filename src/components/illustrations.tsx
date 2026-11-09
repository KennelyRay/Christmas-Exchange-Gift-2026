/** Everything that stands in the picture ends exactly on this line. */
const GROUND_LINE = 256;

const SHADOW = { fill: "#2a1c13", fillOpacity: 0.16 };

/** Opacity only, so it costs next to nothing on cheap phones. Off entirely for reduced motion. */
const TWINKLE_CSS = `
@keyframes tree-twinkle { 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: no-preference) {
  .tree-twinkle { animation: tree-twinkle 2.8s ease-in-out infinite; }
}`;

const twinkle = (delaySeconds: number) => ({ className: "tree-twinkle", style: { animationDelay: `${delaySeconds}s` } });

/** A Christmas tree with presents, drawn from the app's own palette. */
export function TreeAndGifts({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 20 320 258" preserveAspectRatio="xMidYMax meet" aria-hidden className={className}>
      <style>{TWINKLE_CSS}</style>

      <ellipse cx="160" cy={GROUND_LINE + 4} rx="156" ry="16" fill="#efe2c8" />

      <ellipse cx="160" cy={GROUND_LINE} rx="34" ry="6" {...SHADOW} />
      <ellipse cx="60" cy={GROUND_LINE} rx="46" ry="6" {...SHADOW} />
      <ellipse cx="253" cy={GROUND_LINE} rx="40" ry="5" {...SHADOW} />

      {/* Starts inside the lowest branches, which are drawn over it. */}
      <rect x="146" y="200" width="28" height={GROUND_LINE - 200} fill="#5f4a3a" />

      <g transform="translate(0 24)">
        <path d="M160 92l76 100H84z" fill="#173f32" />
        <path d="M160 58l62 88H98z" fill="#1f5443" />
        <path d="M160 24l46 72h-92z" fill="#2b6a55" />

        <path d="M84 192c44 16 108 16 152 0" fill="none" stroke="#e0bb6b" strokeWidth="4" strokeLinecap="round" />
        <path d="M100 146c36 14 84 14 120 0" fill="none" stroke="#e0bb6b" strokeWidth="4" strokeLinecap="round" />

        <circle cx="132" cy="120" r="7" fill="#a3262b" {...twinkle(0)} />
        <circle cx="188" cy="128" r="7" fill="#e0bb6b" {...twinkle(0.7)} />
        <circle cx="116" cy="178" r="7" fill="#e0bb6b" {...twinkle(1.4)} />
        <circle cx="162" cy="164" r="7" fill="#a3262b" {...twinkle(2.1)} />
        <circle cx="206" cy="184" r="7" fill="#fbf4e6" stroke="#a3262b" strokeWidth="2" {...twinkle(1)} />

        <path d="M160 2l7 17 17 7-17 7-7 17-7-17-17-7 17-7z" fill="#e0bb6b" {...twinkle(0.35)} />
      </g>

      {/* Inside each gift, y=0 is the ground line and everything above it is negative. */}
      <g transform={`translate(0 ${GROUND_LINE})`}>
        <rect x="24" y="-58" width="72" height="58" rx="3" fill="#a3262b" />
        <rect x="52" y="-58" width="16" height="58" fill="#e0bb6b" />
        <rect x="18" y="-68" width="84" height="20" rx="5" fill="#b83237" />
        <rect x="52" y="-68" width="16" height="20" fill="#e0bb6b" />
        <path d="M60-68c-22-22-40-4-16 0h16zM60-68c22-22 40-4 16 0H60z" fill="#e0bb6b" />
      </g>

      <g transform={`translate(0 ${GROUND_LINE})`}>
        <rect x="222" y="-44" width="62" height="44" rx="3" fill="#fbf4e6" stroke="#80590f" strokeWidth="2" />
        <rect x="246" y="-44" width="14" height="44" fill="#a3262b" />
        <rect x="216" y="-54" width="74" height="17" rx="4" fill="#efe2c8" stroke="#80590f" strokeWidth="2" />
        <rect x="246" y="-54" width="14" height="17" fill="#a3262b" />
        <path d="M253-54c-18-18-34-3-13 0h13zM253-54c18-18 34-3 13 0h-13z" fill="#a3262b" />
      </g>
    </svg>
  );
}
