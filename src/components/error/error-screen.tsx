import type { ReactNode } from "react";

/* On-brand error/empty screen used by the app's error boundaries + 404. Kept
   self-contained (no navbar import) so it stays lightweight in the error bundle.
   Restrained, calm tone — brand navy #1a2744 + blue #009FD9, friendly Spanish,
   clear recovery actions. Fully responsive / centered down to ~360px. */

export const errorPrimaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-sm px-5 py-3 transition-all active:scale-[0.98] w-full sm:w-auto";
export const errorSecondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-white text-[#374151] font-bold text-sm px-5 py-3 hover:border-[#009FD9] transition-colors w-full sm:w-auto";

function BrandLogo() {
  return (
    <span className="flex items-center gap-2.5 select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-mark.png"
        srcSet="/logo-mark.png 1x, /logo-mark@2x.png 2x"
        alt="ContrataCR"
        width={36}
        height={36}
        className="h-8 w-8 sm:h-9 sm:w-9"
      />
      <span className="text-[20px] sm:text-[22px] font-extrabold tracking-tight leading-none">
        <span className="text-[#1a2744]">Contrata</span>
        <span className="text-[#009FD9]">CR</span>
      </span>
    </span>
  );
}

export function ErrorScreen({
  code,
  title,
  message,
  icon,
  children,
}: {
  code?: string;
  title: string;
  message: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12 text-center">
      <a href="/" aria-label="ContrataCR inicio" className="mb-8 sm:mb-10">
        <BrandLogo />
      </a>

      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f1f5f9] mb-5 text-[#1a2744]">
          {icon}
        </div>
      )}

      {code && (
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#009FD9] mb-2">{code}</p>
      )}

      <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1a2744] leading-tight">{title}</h1>
      <p className="mt-3 max-w-md text-[15px] text-[#6b7280] leading-relaxed">{message}</p>

      {children && (
        <div className="mt-7 flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
