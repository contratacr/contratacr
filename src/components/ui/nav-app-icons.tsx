// Small marks for the navigation apps on result cards (owner 2026-11-26: each action with its own icon).
// Drawn in currentColor so they take the ContrataCR colours of the chip.
export function WazeIcon({ className = "h-4 w-4" }: { className?: string }) {
  // The Waze smiling bubble: round head, a little tail on the left, two wheels.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.3 16.9C4.4 16 3.6 14.6 3.6 12.4 3.6 7.6 7.4 3.6 12.3 3.6c4.6 0 8.2 3.6 8.2 8 0 3.9-3 6.6-6.9 6.6h-3.4" />
      <path d="M3.6 12.4c0 1.6-.5 2.6-1.3 3.2 1.4.4 2.8.2 4-.7" />
      <circle cx="8.3" cy="19.2" r="1.7" /><circle cx="15.8" cy="19.2" r="1.7" />
      <path d="M10 9.6v.6M14.6 9.6v.6M10 13c1.3 1.1 3.3 1.1 4.6 0" />
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
