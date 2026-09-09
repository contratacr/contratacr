"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Share2 } from "lucide-react";
import { AvisoFlotante } from "@/components/ui/aviso-flotante";
import { useNativeShare } from "@/hooks/use-native-share";
import { cn } from "@/lib/utils";

function urlCompleta(url: string) {
  if (url.startsWith("http")) return url;
  return `${typeof window === "undefined" ? "" : window.location.origin}${url}`;
}

/**
 * La lógica de compartir en un solo lugar: la hoja del teléfono si existe y, si
 * no, copiar el enlace y decirlo. La usan el botón de compartir y el menú "..."
 * de las fichas, para que las dos puertas hagan exactamente lo mismo.
 */
export function useCompartir() {
  const t = useTranslations("profile");
  const nativo = useNativeShare();
  const [aviso, setAviso] = useState<string | null>(null);

  const copiar = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(urlCompleta(url));
      setAviso(t("linkCopied"));
    } catch { /* sin portapapeles */ }
  }, [t]);

  const compartir = useCallback(async (url: string, titulo?: string) => {
    const completa = urlCompleta(url);
    if (nativo) {
      try { await navigator.share({ title: titulo, url: completa }); return; } catch { /* cancelado */ }
    }
    await copiar(url);
  }, [copiar, nativo]);

  const avisoNodo: ReactNode = aviso ? <AvisoFlotante texto={aviso} onFin={() => setAviso(null)} /> : null;
  return { compartir, copiar, avisoNodo };
}

/**
 * Compartir una ficha. `sutil` es la forma que usan las fichas: ícono con
 * rótulo, sin borde y sin peso de botón. `onPress` lo deja delegar en quien ya
 * tiene su propia hoja de compartir.
 */
export function BotonCompartir({ url, titulo, onPress, sutil = false, className }: { url?: string; titulo?: string; onPress?: () => void; sutil?: boolean; className?: string }) {
  const t = useTranslations("profile");
  const { compartir, avisoNodo } = useCompartir();
  const rotulo = t("share");

  return (
    <>
      <button
        type="button"
        onClick={() => { if (onPress) { onPress(); return; } if (url) void compartir(url, titulo); }}
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
      {avisoNodo}
    </>
  );
}
