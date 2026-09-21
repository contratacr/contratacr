"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PIE_VENTANA_BASE } from "@/components/ui/acciones-al-pie";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { useNativeFullscreenLayer } from "@/hooks/use-native-app";

// Shared modal/dialog primitive — the single source of truth for the app's modal
// chrome (used by "Nuevo servicio", "Agregar profesión", "Publicar proyecto",
// "Soporte", …). Dimmed backdrop + centered white rounded dialog with a PINNED
// header (title + X) and an optional PINNED footer, and a SCROLLING body
// (max-height ~90vh) so a tall form never gets cut off. Closes on X, backdrop
// click and Esc; locks background scroll. Full-width bottom-sheet on mobile.

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-5xl",
} as const;

interface ModalProps {
  /** Render-when-mounted is fine; defaults to open. */
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: keyof typeof SIZES;
  children: ReactNode;
  /** Optional pinned footer (e.g. Cancelar / Guardar). */
  footer?: ReactNode;
  /** Optional validation/status notice pinned immediately above the footer. */
  footerNotice?: ReactNode;
  /** aria-label for the X button. */
  closeLabel?: string;
  /** Cuando el diálogo se abre ENCIMA de otro paso, salir es volver: con esta
   *  etiqueta la esquina muestra una flecha en vez de la equis, en cualquier
   *  tamaño de pantalla. */
  backLabel?: string;
  /** Qué hace esa flecha. Sin esto vuelve a cerrar; con esto retrocede un paso
   *  dentro del mismo diálogo (de un oficio al listado de categorías). */
  onBack?: () => void;
  /** Extra classes on the body wrapper (e.g. remove default padding). */
  bodyClassName?: string;
  /** Small alerts can stay centered on mobile; long forms keep the bottom sheet.
   *  "sheet-compact": a bottom sheet everywhere — the app does NOT stretch it to
   *  full height (short task forms: support, report, day editors). */
  mobilePresentation?: "sheet" | "center" | "fullscreen" | "sheet-compact";
  /** Extra classes on the pinned footer. */
  footerClassName?: string;
  /** Oculta la barra de título: para avisos con el título centrado bajo el ícono. */
  hideHeader?: boolean;
}

/**
 * Las sombras de los bordes de una ventana que se desplaza: la cabecera y el
 * pie SOLO levantan sombra cuando de verdad hay contenido escondido debajo.
 *
 * Isaac preguntó si esas dos franjas deberían llevar sombra como la tarjeta del
 * cuerpo. Una sombra fija no dice nada —nada se está tapando—; una sombra que
 * aparece al desplazar SÍ: es la señal de «sigue». Es lo que hacen Gmail, los
 * títulos grandes de iOS y Material. La línea de siempre se queda: separa
 * aunque no haya nada que levantar.
 */
function useSombrasDeBorde(ref: React.RefObject<HTMLDivElement | null>) {
  const [sombras, setSombras] = useState({ arriba: false, abajo: false });
  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const medir = () => setSombras({
      arriba: nodo.scrollTop > 1,
      abajo: nodo.scrollTop + nodo.clientHeight < nodo.scrollHeight - 1,
    });
    medir();
    nodo.addEventListener("scroll", medir, { passive: true });
    // El cuerpo crece y encoge solo: un desplegable que se abre, un error que
    // aparece, un adjunto que se agrega.
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    for (const hijo of Array.from(nodo.children)) observador.observe(hijo);
    return () => { nodo.removeEventListener("scroll", medir); observador.disconnect(); };
  }, [ref]);
  return sombras;
}

/** Hacia abajo (la lleva la cabecera) y hacia arriba (la lleva el pie). */
const SOMBRA_ABAJO = "shadow-[0_6px_10px_-8px_rgba(15,23,42,0.35)]";
const SOMBRA_ARRIBA = "shadow-[0_-6px_10px_-8px_rgba(15,23,42,0.35)]";

export function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  size = "md",
  children,
  footer,
  footerNotice,
  closeLabel = "Cerrar",
  backLabel,
  onBack,
  bodyClassName,
  mobilePresentation = "sheet",
  footerClassName,
  hideHeader = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const releaseBodyScroll = lockBodyScroll();
    return () => { document.removeEventListener("keydown", onKey); releaseBodyScroll(); };
  }, [open, onClose]);

  // In the app every non-centered modal stretches to the full viewport (see the
  // shell CSS), so the app chrome must not float above it.
  useNativeFullscreenLayer(Boolean(open) && (mobilePresentation === "sheet" || mobilePresentation === "fullscreen"));

  const cuerpo = useRef<HTMLDivElement>(null);
  const sombras = useSombrasDeBorde(cuerpo);

  if (!open) return null;

  const centeredMobile = mobilePresentation === "center";
  const fullscreenMobile = mobilePresentation === "fullscreen";
  const compactSheet = mobilePresentation === "sheet-compact";

  const conFlecha = !!(backLabel || onBack);
  const salida = (
    <button
      type="button"
      onClick={onBack ?? onClose}
      aria-label={backLabel ?? closeLabel}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#68778d] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]",
        conFlecha || fullscreenMobile
          ? "absolute left-4 top-1/2 -translate-y-1/2 sm:static sm:translate-y-0"
          : "absolute right-4 top-1/2 -translate-y-1/2 sm:static sm:translate-y-0",
      )}
    >
      {conFlecha ? (
        <ArrowLeft className="h-5 w-5" />
      ) : fullscreenMobile ? (
        <>
          <ArrowLeft className="h-5 w-5 sm:hidden" />
          <X className="hidden h-5 w-5 sm:block" />
        </>
      ) : (
        <X className="h-5 w-5" />
      )}
    </button>
  );

  return (
    <div
      className={cn(
        "app-modal-screen fixed inset-0 z-[100] flex justify-center",
        centeredMobile && "app-centered-modal-screen",
        compactSheet && "app-sheet-compact-screen",
        fullscreenMobile ? "items-stretch sm:items-center sm:p-4" : centeredMobile ? "items-center p-4" : "items-end sm:items-center sm:p-4"
      )}
    >
      {/* Dimmed backdrop — click to close */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog: full-width bottom-sheet on mobile, centered card on desktop. */}
      <div
        role="dialog"
        aria-modal="true"
        // Hay contenido escondido debajo. Muchos formularios dibujan su propio
        // pie DENTRO del cuerpo (soporte, publicar empleo): la regla
        // `[data-ccr-hay-mas] .ccr-pie-ventana` de layout.tsx se lo da a todos
        // sin que cada uno tenga que enterarse.
        data-ccr-hay-mas={sombras.abajo ? "" : undefined}
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl",
          fullscreenMobile
            ? "app-fullscreen-modal h-[var(--app-visual-viewport-height)] max-h-[var(--app-visual-viewport-height)] rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
            : centeredMobile
              ? "app-centered-modal max-h-[calc(var(--app-visual-viewport-height)-2rem)] rounded-2xl"
              : "max-h-[92vh] rounded-t-2xl",
          "app-bottom-sheet min-h-0",
          SIZES[size]
        )}
      >
        {/* Header (pinned) */}
        {!hideHeader && <div
          className={cn(
            // `relative z-10`: la sombra cae SOBRE el cuerpo, y el cuerpo se
            // pinta después. Sin esto, un cuerpo con fondo propio —el gris de
            // soporte— la borraba.
            "relative z-10 flex shrink-0 gap-3 border-b border-[#e5e7eb] bg-white px-5 py-4 transition-shadow sm:px-6",
            sombras.arriba && SOMBRA_ABAJO,
            // En el teléfono el título va centrado y la X flota al lado: si la X
            // ocupara lugar en la fila, el título quedaría corrido su ancho
            // (22 px medidos) y "centrado" sería mentira.
            fullscreenMobile
              ? "relative items-center justify-center sm:static sm:items-start sm:justify-between"
              : "relative items-center justify-center sm:static sm:items-start sm:justify-between",
            // Con flecha, la salida va DELANTE del título también en pantalla
            // grande: una flecha a la derecha se lee como "siguiente".
            conFlecha && "sm:items-center sm:justify-start sm:gap-2",
          )}
        >
          {/* Con flecha, la salida se dibuja ANTES del título en el propio orden
              del documento: una clase de reordenar no sirve aquí —`sm:order-first`
              ni siquiera llegó a generarse en el CSS— y una flecha a la derecha
              del título se lee como "siguiente", no como "atrás". */}
          {conFlecha && salida}
          <div className={cn("min-w-0 px-10 text-center sm:px-0 sm:text-left")}>
            {/* REGLA: en el teléfono la cabecera es UNA línea —flecha, título y
                nada más—, para que mida lo mismo en todas las ventanas. El título
                se recorta con «…» y el subtítulo aparece de 640 px en adelante. */}
            <h2 className={cn("truncate leading-tight text-[#162543] sm:whitespace-normal", fullscreenMobile ? "text-[17px] font-extrabold sm:text-lg sm:font-bold" : "text-lg font-bold")}>{title}</h2>
            {subtitle && <p className="mt-0.5 hidden text-xs text-[#6b7280] sm:block">{subtitle}</p>}
          </div>
          {!conFlecha && salida}
        </div>}

        {/* Body (scrolls) */}
        {/* QUIEN PIDE «SIN RELLENO» LO OBTIENE TAMBIÉN EN COMPUTADORA.
            El relleno base es `px-5 py-5 sm:px-6`, y once ventanas pasaban
            `px-0 py-0` para pegar su contenido a los bordes (publicar y editar
            empleo y promoción, el selector de servicios, el registro
            profesional…). Pero `px-0` solo le gana a `px-5`: `sm:px-6` es otra
            variante y sobrevivía. Resultado: en el teléfono quedaban a ras y de
            640 px en adelante con 24 px por lado, así que la franja blanca del
            pie —que va dentro del cuerpo— no llegaba a los bordes y se veía
            como un recuadro cortado dentro de la ventana. Solo en computadora,
            que es justo como lo reportó Isaac.
            Se resuelve aquí y no en las once: si el relleno pedido es CERO, el
            de esta variante tampoco se pone. Un valor distinto de cero se
            respeta como antes. */}
        <div ref={cuerpo} className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          / (?:px|p)-0(?:\s|$)/.test(` ${bodyClassName ?? ""} `) ? "px-5" : "px-5 sm:px-6",
          "py-5",
          bodyClassName,
        )}>
          {children}
        </div>

        {footerNotice && (
          <div className={cn("relative z-10 shrink-0 border-t border-[#eef2f6] bg-white px-5 pt-3 transition-shadow sm:px-6", sombras.abajo && SOMBRA_ARRIBA)}>
            {footerNotice}
          </div>
        )}

        {/* Footer (pinned) */}
        {footer && (
          <div className={cn(PIE_VENTANA_BASE, "relative z-10 flex justify-end gap-3 transition-shadow", sombras.abajo && SOMBRA_ARRIBA, footerNotice && "border-t-0", footerClassName)}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
