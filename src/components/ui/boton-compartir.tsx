"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AvisoFlotante } from "@/components/ui/aviso-flotante";
import { useNativeShare } from "@/hooks/use-native-share";
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
