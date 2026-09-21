"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link2, Share2 } from "lucide-react";
import { AvisoFlotante } from "@/components/ui/aviso-flotante";
import { useNativeShare } from "@/hooks/use-native-share";
import { cn } from "@/lib/utils";
import { compartirConHojaNativa } from "@/lib/compartir-nativo";

/**
 * ¿Lo mueve un ratón? Es la MISMA pregunta que hace el CSS de
 * `data-ccr-compartir` para elegir la cara del botón. Chrome en macOS SÍ trae
 * `navigator.share`: mirando solo eso, el botón decía «Copiar enlace» y abría
 * la hoja del sistema. La cara y la acción tienen que responder a lo mismo.
 */
export function esRaton() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Las dos caras de compartir —dedo y ratón— para ponerlas donde haga falta:
 *  el botón de la ficha y las opciones del «···» usan exactamente esta. */
export function CaraCompartir({ dedo, raton }: { dedo: ReactNode; raton: ReactNode }) {
  return (
    <>
      <span className="ccr-compartir-dedo inline-flex items-center gap-[inherit]">{dedo}</span>
      <span className="ccr-compartir-raton">{raton}</span>
    </>
  );
}

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
    // Con ratón se copia el enlace, como LinkedIn: es lo que dice el botón.
    if (esRaton()) { await copiar(url); return; }
    // Cancelar la hoja ya no copia el enlace "por si acaso".
    if (nativo && await compartirConHojaNativa({ title: titulo, url: completa }) !== "no-disponible") return;
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
  const tMenu = useTranslations("menuFicha");
  const { compartir, avisoNodo } = useCompartir();
  // DICE LO QUE VA A HACER, Y NO PARPADEA. En computadora no hay hoja del
  // sistema: el botón copia el enlace, así que dice «Copiar enlace», como
  // LinkedIn. En el teléfono abre la hoja y dice «Compartir».
  //
  // Las dos caras se pintan SIEMPRE y elige el CSS (ver `data-ccr-compartir` en
  // layout.tsx). Decidirlo con `navigator.share` —que solo existe en el
  // navegador— hacía que el rótulo y el icono cambiaran al hidratar, en cada
  // carga. La acción sigue mirando si hay hoja en el momento del toque, que es
  // cuando importa.
  const rotuloRaton = tMenu("copyLink");
  const rotuloDedo = t("share");

  return (
    <>
      <button
        type="button"
        onClick={() => { if (onPress) { onPress(); return; } if (url) void compartir(url, titulo); }}
        // Para lectores de pantalla, la acción en una sola palabra: no pueden
        // «ver» cuál de las dos caras está visible.
        aria-label={rotuloDedo}
        className={cn(
          sutil
            ? "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-[#52627a] transition-colors duration-200 hover:bg-[#eef3f8] hover:text-[#162543]"
            : "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-bold text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
          className,
        )}
      >
        <CaraCompartir
          dedo={<><Share2 className="h-4 w-4 shrink-0" />{rotuloDedo}</>}
          raton={<><Link2 className="h-4 w-4 shrink-0" />{rotuloRaton}</>}
        />
      </button>
      {avisoNodo}
    </>
  );
}
