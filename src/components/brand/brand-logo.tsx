import { cn } from "@/lib/utils";

export function ContrataCRMark({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const src = tone === "dark" ? "/logo-mark-dark.png" : "/logo-mark-transparent.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="ContrataCR"
      width={32}
      height={32}
      className={cn("h-8 w-8 select-none", className)}
    />
  );
}
/* --- El logotipo (marca + palabra). Sin tamaños: uno solo, 32 + 19. --- */
export function ContrataCRLogo({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <div className={cn("flex items-center gap-0 select-none", className)}>
      <ContrataCRMark tone={tone} />
      {/* Outlined Inter 800: identical before/after fonts load, including cold starts. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tone === "dark" ? "/brand/wordmark-dark.svg" : "/brand/wordmark-light.svg"} alt="" aria-hidden="true" width={105} height={24} className="h-6 w-[105px] shrink-0" />
    </div>
  );
}

