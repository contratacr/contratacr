"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Share2 } from "lucide-react";
import { AvisoFlotante } from "@/components/ui/aviso-flotante";
import { useNativeShare } from "@/hooks/use-native-share";
import { cn } from "@/lib/utils";

/**
 * Compartir una ficha: la hoja del teléfono si existe y, si no, copia el enlace
 * y lo dice. Vive al lado del favorito, arriba en la tarjeta: las dos son
 * acciones sobre la ficha, no formas de contactar a nadie.
 *
 * `soloIcono` lo deja del mismo tamaño y forma que el marcador de favoritos.
 * `onPress` lo deja delegar en quien ya tiene su propia hoja de compartir.
 */
export function BotonCompartir({ url, titulo, onPress, soloIcono = false, className }: { url?: string; titulo?: string; onPress?: () => void; soloIcono?: boolean; className?: string }) {
  const t = useTranslations("profile");
  const nativo = useNativeShare();
  const [aviso, setAviso] = useState<string | null>(null);
  const rotulo = t("share");

  async function compartir() {
    if (onPress) { onPress(); return; }
    if (!url) return;
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
        title={rotulo}
        className={cn(
          soloIcono
            ? "grid h-11 w-11 place-items-center rounded-full border border-[#d7e1ea] bg-white text-[#162543] transition-colors duration-200 hover:border-[#b9c8d6] hover:bg-[#f6f9fb]"
            : "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-bold text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
          className,
        )}
      >
        <Share2 className={soloIcono ? "h-5 w-5" : "h-4 w-4"} />
        {!soloIcono && rotulo}
      </button>
      {aviso && <AvisoFlotante texto={aviso} onFin={() => setAviso(null)} />}
    </>
  );
}
