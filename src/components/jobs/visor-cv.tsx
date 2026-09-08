"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { ArrowLeft, Download, FileText, X } from "lucide-react";
import { useNativeApp } from "@/hooks/use-native-app";
import { cn } from "@/lib/utils";

// Abrir un CV no tenía salida dentro de la app: el enlace bajaba el archivo o
// pedía una pestaña nueva, y en la app no existe ninguna de las dos cosas —
// quedabas en una pantalla en blanco sin cómo volver.
//
// Acá el CV se ve DENTRO de la app, en una hoja a pantalla completa con su
// flecha de volver. En la web se conserva el comportamiento de siempre: abrir
// en otra pestaña o bajar el archivo, que ahí sí tiene sentido.
export function VisorDeCv({
  applicationId,
  nombreArchivo,
  variante = "boton",
  className,
}: {
  applicationId: string;
  nombreArchivo?: string | null;
  /** "boton" = botón con texto; "icono" = solo el icono, para filas apretadas. */
  variante?: "boton" | "icono";
  className?: string;
}) {
  const nativeApp = useNativeApp();
  const locale = useLocale();
  const esEn = locale === "en";
  const [abierto, setAbierto] = useState(false);

  const nombre = nombreArchivo || "CV";
  const rutaVer = `/api/jobs/applications/${applicationId}/resume?ver=1`;
  const rutaBajar = `/api/jobs/applications/${applicationId}/resume`;
  const etiqueta = esEn ? "View CV" : "Ver CV";

  if (!nativeApp) {
    return (
      <a
        href={variante === "icono" ? rutaBajar : rutaVer}
        target="_blank"
        rel="noreferrer"
        aria-label={variante === "icono" ? (esEn ? "Download CV" : "Descargar CV") : undefined}
        title={variante === "icono" ? (esEn ? "Download CV" : "Descargar CV") : undefined}
        className={className}
      >
        {variante === "icono" ? <Download className="h-4 w-4" /> : (<><FileText className="h-4 w-4 text-[#008fc3]" />{etiqueta}</>)}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={variante === "icono" ? etiqueta : undefined}
        title={variante === "icono" ? etiqueta : undefined}
        className={className}
      >
        {variante === "icono" ? <FileText className="h-4 w-4" /> : (<><FileText className="h-4 w-4 text-[#008fc3]" />{etiqueta}</>)}
      </button>

      {abierto && (
        <div className="app-modal-screen fixed inset-0 z-[110] flex items-stretch justify-center bg-white">
          <div role="dialog" aria-modal="true" aria-label={nombre} className="flex h-[var(--app-visual-viewport-height)] w-full flex-col">
            <div className="relative flex shrink-0 items-center justify-center border-b border-[#e5e7eb] px-14 py-3">
              <p className="truncate text-sm font-bold text-[#162543]">{nombre}</p>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label={esEn ? "Back" : "Volver"}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#162543] transition-colors hover:bg-[#f3f4f6]"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label={esEn ? "Close" : "Cerrar"}
                className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#68778d] transition-colors hover:bg-[#f3f4f6] sm:flex"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              src={rutaVer}
              title={nombre}
              className={cn("min-h-0 flex-1 border-0 bg-[#f4f7fa]")}
            />
          </div>
        </div>
      )}
    </>
  );
}
