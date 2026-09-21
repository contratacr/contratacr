"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type OpcionFicha = {
  id: string;
  icono: ReactNode;
  texto: ReactNode;
  /** El texto en una sola palabra, para lectores de pantalla y para cuando la
   *  opción se dibuja sola —sin menú— y solo se ve su ícono. */
  etiqueta?: string;
  onSelect: () => void;
  /** Rojo, para lo que denuncia o borra. */
  peligro?: boolean;
};

/**
 * El "..." de la cabecera de una ficha: guarda lo que no es la acción principal
 * ni la secundaria (compartir, copiar el enlace, reportar). Es el patrón que la
 * gente ya conoce de otras apps, y evita que cada acción menor pelee un lugar
 * junto al botón que sí importa.
 *
 * En el teléfono abre una hoja desde abajo; en computadora, un panel junto al
 * botón. La misma marcación en los dos casos: solo cambian las clases.
 */
export function MenuFicha({
  opciones,
  grande = false,
  className,
  controlado,
}: {
  opciones: OpcionFicha[];
  /** Del tamaño de la flecha de volver, para una cabecera. */
  grande?: boolean;
  className?: string;
  /**
   * Cuando el «...» lo dibuja otro —la barra de arriba en la ficha del
   * profesional—, la hoja se abre desde afuera. Así el menú es EL MISMO en
   * todas las fichas: mismas opciones, mismo orden y misma hoja, aunque el
   * botón que lo abre viva en otro sitio.
   */
  controlado?: { abierto: boolean; onCambio: (abierto: boolean) => void };
}) {
  const t = useTranslations("menuFicha");
  const [abiertoPropio, setAbiertoPropio] = useState(false);
  const abierto = controlado ? controlado.abierto : abiertoPropio;
  const setAbierto = (valor: boolean | ((v: boolean) => boolean)) => {
    const siguiente = typeof valor === "function" ? valor(abierto) : valor;
    if (controlado) controlado.onCambio(siguiente);
    else setAbiertoPropio(siguiente);
  };
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  // EL PANEL DE COMPUTADORA CUELGA DEL BODY, como la hoja del teléfono. Dentro
  // de la ficha estaba a merced de lo que tuviera encima: la ficha de un
  // proyecto vive en una columna con `overflow-y-auto` y lleva una barra de
  // acciones `sticky` opaca justo debajo del título, y el menú —abierto desde
  // el «···» de esa misma línea— terminaba cortado a la altura de la barra.
  // Colgado del body no hay ancestro que lo recorte ni hermano que lo tape.
  const [ancla, setAncla] = useState<{ arriba: number; derecha: number } | null>(null);

  useEffect(() => {
    if (!abierto) { setAncla(null); return; }
    const medir = () => {
      // Cuando el «···» lo dibuja otro (`controlado`), el botón propio está
      // oculto y no mide: el ancla es entonces la caja, que es donde el panel
      // se colocaba antes con `top-full`.
      const b = boton.current?.getBoundingClientRect();
      const r = b && b.height > 0 ? b : caja.current?.getBoundingClientRect();
      if (r) setAncla({ arriba: r.bottom + 4, derecha: Math.max(8, window.innerWidth - r.right) });
    };
    medir();
    // Al desplazar cualquier cosa —la página o la columna de la ficha— el
    // botón se mueve y el panel tiene que ir con él.
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTocarFuera = (e: MouseEvent) => {
      const destino = e.target as Element | null;
      // La hoja del teléfono cuelga del body, fuera de esta caja: sin esta
      // salvedad el mousedown la cerraba antes de que el toque llegara a la
      // opción, y no pasaba nada.
      if (destino?.closest?.("[data-menu-ficha]")) return;
      if (caja.current && !caja.current.contains(destino as Node)) setAbierto(false);
    };
    const alEscapar = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", alTocarFuera);
    document.addEventListener("keydown", alEscapar);
    return () => {
      document.removeEventListener("mousedown", alTocarFuera);
      document.removeEventListener("keydown", alEscapar);
    };
  }, [abierto]);

  if (opciones.length === 0) return null;

  // UNA SOLA OPCIÓN NO ES UN MENÚ. En la ficha de un proyecto propio, en
  // computadora, no hay «guardar» (es suyo) ni «reportar» (es suyo): quedaba un
  // «···» que abría una tarjeta blanca con un renglón, y esa tarjeta —alta,
  // con sombra y espacio abajo— se leía como una lista recortada. Si solo hay
  // una acción, el botón LA HACE de una vez.
  if (opciones.length === 1 && !controlado) {
    const sola = opciones[0];
    return (
      <div className={cn("relative", className)}>
        <button
          type="button"
          // Sin `title`: el tooltip no puede saber cuál de las dos caras de
          // compartir está visible, y prometería lo que no hace.
          aria-label={sola.etiqueta ?? t("more")}
          onClick={sola.onSelect}
          className={cn(
            "grid place-items-center rounded-full text-[#162543] transition-colors hover:bg-[#eef3f8]",
            grande ? "h-11 w-11" : "h-10 w-10",
          )}
        >
          <span className="grid h-5 w-5 place-items-center [&_svg]:h-[18px] [&_svg]:w-[18px]">{sola.icono}</span>
        </button>
      </div>
    );
  }

  const lista = (
    <div
      role="menu"
      data-menu-ficha=""
      aria-label={t("more")}
      className="ccr-menu-ficha overflow-hidden rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.45)] lg:rounded-xl lg:border lg:border-[#e5e7eb] lg:pb-2 lg:shadow-[0_18px_38px_-18px_rgba(15,23,42,0.35)]"
    >
      <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-full bg-[#d7e1ea] lg:hidden" />
      {opciones.map((opcion) => (
        <button
          key={opcion.id}
          type="button"
          role="menuitem"
          onClick={() => { setAbierto(false); opcion.onSelect(); }}
          className={cn(
            "flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-bold transition-colors hover:bg-[#f4f7fa] lg:px-4 lg:py-2.5 lg:text-sm",
            opcion.peligro ? "text-[#c0392b]" : "text-[#162543]",
          )}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center">{opcion.icono}</span>
          {opcion.texto}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={caja} className={cn("relative", className)}>
      <button
        type="button"
        hidden={!!controlado}
        aria-label={t("more")}
        aria-haspopup="menu"
        aria-expanded={abierto}
        ref={boton}
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          "grid place-items-center rounded-full text-[#162543] transition-colors hover:bg-[#eef3f8]",
          grande ? "h-11 w-11" : "h-10 w-10",
        )}
      >
        {/* El mismo peso de trazo que la flecha de volver: con el grosor normal los
            tres puntos se veían más chicos que ella. */}
        <MoreHorizontal className={grande ? "h-6 w-6" : "h-[22px] w-[22px]"} strokeWidth={2.6} />
      </button>
      {abierto && (
        <>
          {/* Teléfono: hoja desde abajo, colgada del body para que ninguna
              tarjeta la recorte. Computadora: panel junto al botón. */}
          {typeof document !== "undefined" && createPortal(
            <>
              <div className="fixed inset-0 z-[1450] lg:hidden">
                <button type="button" aria-label={t("close")} onClick={() => setAbierto(false)} className="absolute inset-0 bg-[#071426]/45" />
                <div className="absolute inset-x-0 bottom-0">{lista}</div>
              </div>
              {ancla && (
                <div
                  className="fixed z-[1450] hidden w-56 lg:block"
                  style={{ top: ancla.arriba, right: ancla.derecha }}
                >
                  {lista}
                </div>
              )}
            </>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
