import { VERIFIED_SEAL_PATH, VERIFIED_CHECK_PATH } from "@/lib/verified-seal";

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
        d={VERIFIED_SEAL_PATH}
        fill="currentColor"
      />
      <path d={VERIFIED_CHECK_PATH} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
