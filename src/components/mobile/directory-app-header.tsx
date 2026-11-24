"use client";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

// Cabecera de pantalla del directorio (estructura de Yelp, colores propios): flecha circular, título en negrita con
// subtítulo gris y un botón de ícono a la derecha. Sin `backHref` vuelve en el historial (y a «/» si no hay).
export function DirectoryAppHeader({ title, subtitle, right, backHref, className }: { title: string; subtitle?: string; right?: ReactNode; backHref?: string; className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const en = locale === "en";
  const label = en ? "Back" : "Volver";
  const boton = "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#162543]/15 bg-white text-[#162543] transition-colors active:bg-[#162543]/5";
  return (
    <header data-directory-app-header="" className={className ?? "flex items-center gap-3 px-4 py-3"}>
      {backHref ? (
        <Link href={backHref} aria-label={label} className={boton}><ArrowLeft className="h-5 w-5" aria-hidden /></Link>
      ) : (
        <button type="button" aria-label={label} onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/"))} className={boton}><ArrowLeft className="h-5 w-5" aria-hidden /></button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[19px] font-extrabold leading-6 text-[#162543]">{title}</h1>
        {subtitle ? <p className="truncate text-[13px] leading-snug text-[#162543]/60">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </header>
  );
}
