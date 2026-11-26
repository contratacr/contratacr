// Small marks for the navigation apps on result cards (owner 2026-11-26: each action with its own icon).
// Drawn in currentColor so they take the ContrataCR colours of the chip.
export function WazeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.2 15.6C3.6 14.7 3 13.4 3 12c0-4.4 3.9-8 8.7-8 4.8 0 8.3 3.4 8.3 7.6 0 4.1-3.4 6.6-7.4 6.6H9.4" />
      <circle cx="6.8" cy="18.3" r="1.6" /><circle cx="15.2" cy="18.3" r="1.6" />
      <path d="M9.4 10.1v.1M14.4 10.1v.1M9.6 13.2c1.3 1.1 3.3 1.1 4.6 0" />
    </svg>
  );
}
export function GoogleMapsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21.5s6.5-6.2 6.5-11.4A6.5 6.5 0 0 0 5.5 10.1c0 5.2 6.5 11.4 6.5 11.4Z" /><circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}
