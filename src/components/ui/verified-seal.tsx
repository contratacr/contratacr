// The ONE verification mark: an Instagram-style seal (solid scalloped badge with
// a white check) in ContrataCR brand blue via currentColor. Every "verified"
// indicator renders this shape so the signal reads identically everywhere.
export function VerifiedSeal({ className = "h-4 w-4", label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill="currentColor"
      />
      <path d="m9 12 2 2 4-4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
