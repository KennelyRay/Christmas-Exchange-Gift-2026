/** A Christmas tree with presents, drawn from the app's own palette. */
export function TreeAndGifts({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 280" aria-hidden className={className}>
      <ellipse cx="160" cy="262" rx="140" ry="14" fill="#efe2c8" />

      <rect x="146" y="214" width="28" height="44" rx="4" fill="#5f4a3a" />
      <path d="M160 92l76 100H84z" fill="#173f32" />
      <path d="M160 58l62 88H98z" fill="#1f5443" />
      <path d="M160 24l46 72h-92z" fill="#2b6a55" />

      <path d="M84 192c44 16 108 16 152 0" fill="none" stroke="#e0bb6b" strokeWidth="4" strokeLinecap="round" />
      <path d="M100 146c36 14 84 14 120 0" fill="none" stroke="#e0bb6b" strokeWidth="4" strokeLinecap="round" />

      <circle cx="132" cy="120" r="7" fill="#a3262b" />
      <circle cx="188" cy="128" r="7" fill="#e0bb6b" />
      <circle cx="116" cy="178" r="7" fill="#e0bb6b" />
      <circle cx="162" cy="164" r="7" fill="#a3262b" />
      <circle cx="206" cy="184" r="7" fill="#fbf4e6" stroke="#a3262b" strokeWidth="2" />

      <path d="M160 2l7 17 17 7-17 7-7 17-7-17-17-7 17-7z" fill="#e0bb6b" />

      <g>
        <rect x="24" y="200" width="72" height="58" rx="6" fill="#a3262b" />
        <rect x="52" y="200" width="16" height="58" fill="#e0bb6b" />
        <rect x="18" y="190" width="84" height="20" rx="5" fill="#b83237" />
        <rect x="52" y="190" width="16" height="20" fill="#e0bb6b" />
        <path d="M60 190c-22-22-40-4-16 0h16zM60 190c22-22 40-4 16 0H60z" fill="#e0bb6b" />
      </g>

      <g>
        <rect x="222" y="214" width="62" height="44" rx="6" fill="#fbf4e6" stroke="#80590f" strokeWidth="2" />
        <rect x="246" y="214" width="14" height="44" fill="#a3262b" />
        <rect x="216" y="204" width="74" height="17" rx="4" fill="#efe2c8" stroke="#80590f" strokeWidth="2" />
        <rect x="246" y="204" width="14" height="17" fill="#a3262b" />
        <path d="M253 204c-18-18-34-3-13 0h13zM253 204c18-18 34-3 13 0h-13z" fill="#a3262b" />
      </g>
    </svg>
  );
}
