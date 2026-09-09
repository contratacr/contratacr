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
 * `sutil` es la forma que usamos en las fichas: ícono con rótulo, sin borde y
 * sin peso de botón. Un ícono solo no dice qué hace —el marcador se confunde
 * con el del navegador—, y con borde competía con "Postularme" o "WhatsApp".
 * `onPress` lo deja delegar en quien ya tiene su propia hoja de compartir.
 */
export function BotonCompartir({ url, titulo, onPress, sutil = false, className }: { url?: string; titulo?: string; onPress?: () => void; sutil?: boolean; className?: string }) {
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
          sutil
            ? "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-[#52627a] transition-colors duration-200 hover:bg-[#eef3f8] hover:text-[#162543]"
            : "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-bold text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
          className,
        )}
      >
        <Share2 className="h-4 w-4 shrink-0" />
        {rotulo}
      </button>
      {aviso && <AvisoFlotante texto={aviso} onFin={() => setAviso(null)} />}
    </>
  );
}
