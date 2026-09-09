"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Share2 } from "lucide-react";
import { AvisoFlotante } from "@/components/ui/aviso-flotante";
import { useNativeShare } from "@/hooks/use-native-share";
import { cn } from "@/lib/utils";

/**
 * Compartir una oferta o un empleo: la hoja del teléfono si existe y, si no,
 * copia el enlace y lo dice. Vive con los demás botones de la tarjeta, no como
 * un ícono suelto: es una acción, no una marca.
 */
export function BotonCompartir({ url, titulo, className }: { url: string; titulo?: string; className?: string }) {
  const t = useTranslations("profile");
  const nativo = useNativeShare();
  const [aviso, setAviso] = useState<string | null>(null);
  const rotulo = t("share");

  async function compartir() {
    const completa = url.startsWith("http") ? url : `${typeof window === "undefined" ? "" : window.location.origin}${url}`;
    if (nativo) {
      try { await navigator.share({ title: titulo, url: completa }); return; } catch { /* cancelado */ }
    }
    try {
      await navigator.clipboard.writeText(completa);
      setAviso(t("linkCopied"));
    } catch { /* sin portapapeles */ }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void compartir()}
        aria-label={rotulo}
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-bold text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
          className,
        )}
      >
        <Share2 className="h-4 w-4" />
        {rotulo}
      </button>
      {aviso && <AvisoFlotante texto={aviso} onFin={() => setAviso(null)} />}
    </>
  );
}
