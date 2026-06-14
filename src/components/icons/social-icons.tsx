// Brand social glyphs (currentColor). lucide-react no longer ships Instagram/
// Facebook brand icons, so we provide minimal ones here (TikTok never existed in
// lucide). Used in the profile editor + public profile social-link rows. Website
// uses lucide's generic Globe.

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z" />
    </svg>
  );
}

export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-2.9v11.67a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12V9.25a5.5 5.5 0 1 0 4.7 5.44V9.01a7.13 7.13 0 0 0 4.17 1.33V7.46a4.27 4.27 0 0 1-3.1-1.64Z" />
    </svg>
  );
}
