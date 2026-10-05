"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { cn } from "@/lib/utils";

/*
 * LA FILA QUE SE DESLIZA, como en WhatsApp: Mensajes (archivar, leído) y
 * Notificaciones (eliminar). Una sola para que el gesto se sienta igual en toda
 * la app: el mismo punto de no retorno, la misma curva y el mismo crecimiento
 * del botón hasta cubrir la fila.
 */

// Deslizar una fila hacia la izquierda descubre sus acciones —archivar, y en
// archivadas también eliminar—, como en WhatsApp. Solo con el dedo: en
// escritorio la lista convive con el hilo y ahí no hay gesto. `touch-action:
// pan-y` deja el desplazamiento vertical al navegador y reclama el horizontal;
// si el navegador gana la vertical llega un pointercancel y la fila se repliega.
// El icono del origen no depende de nada del componente: fuera de él se define
// una sola vez en lugar de rehacerse en cada pintado.

// La curva y los tiempos de iOS: arranca rápido y frena largo. Con 180ms
// lineales la fila «saltaba»; así se desliza como en WhatsApp.
export const CURVA_IOS = "cubic-bezier(0.22, 1, 0.36, 1)";
export const SALIR_MS = 340;
// Cuánto hay que pasar el ancho de reposo de los botones para que cuente.
export const MARGEN_DEL_PUNTO = 24;
export const CERRAR_MS = 260;

// Dónde va el icono de la acción que se estira. Antes del punto de no retorno,
// centrado en su botón; pasado, se desliza hasta quedar junto a la fila y la
// acompaña, como en WhatsApp. `left`/`right` con calc se animan entre ambos
// estados aunque el botón cambie de ancho con el dedo.
export function iconoDeAccion(completando: boolean, lado: "left" | "right"): React.CSSProperties {
  return {
    [lado]: completando ? "12px" : "calc(50% - 32px)",
    transition: `${lado} 280ms ${CURVA_IOS}`,
  };
}

// Un toque corto del motor de vibración: solo existe en la app; en la web no hace nada.
export function vibrarSuave() {
  if (!isNativeAppRuntime()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {});
}

export function FilaDeslizable({ className, resaltada = false, abierta, ancho, onEstado, acciones, accionesIzquierda, anchoIzquierda = 0, onCompletarDerecha, onCompletarIzquierda, onPulsacionLarga, onContextMenu, children }: {
  abierta: boolean;
  ancho: number;
  onEstado: (abierta: boolean) => void;
  /** Recibe si el dedo ya pasó el punto de no retorno: ahí queda SOLO la acción
   *  que se va a aplicar, como en WhatsApp, no la fila entera de botones. */
  acciones: (completando: boolean) => ReactNode;
  /** Lo que se descubre al deslizar de izquierda a derecha (leído / no leído). */
  accionesIzquierda?: (completando: boolean) => ReactNode;
  anchoIzquierda?: number;
  /** Deslizar HASTA EL FINAL aplica la acción sin tener que tocar el botón. */
  onCompletarDerecha?: () => void;
  onCompletarIzquierda?: () => void;
  onPulsacionLarga?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** La fila queda marcada mientras su hoja de acciones está abierta. */
  resaltada?: boolean;
  className?: string;
  children: ReactNode;
}) {
  // Medio segundo con el dedo quieto abre la hoja de acciones. Si el dedo se
  // mueve —porque empezó a deslizar o a desplazar la lista— se cancela: el
  // gesto que ya existía manda sobre este.
  const temporizador = useRef<number | null>(null);
  const cancelarPulsacion = () => { if (temporizador.current) { window.clearTimeout(temporizador.current); temporizador.current = null; } };
  const [dx, setDx] = useState(abierta ? -ancho : 0);
  const dxRef = useRef(dx);
  useEffect(() => { dxRef.current = dx; }, [dx]);
  const arrastre = useRef<{ id: number; x: number; y: number; base: number; eje: "" | "x" | "y" } | null>(null);
  const movido = useRef(false);
  // El pintado no puede leer la referencia del arrastre: la misma información
  // vive en este estado.
  const [arrastrando, setArrastrando] = useState(false);
  // El ancho real de la fila: con él se sabe cuándo el deslizamiento llegó al
  // final y hasta dónde tiene que estirarse el fondo de la acción para que no
  // quede un pedazo vacío detrás.
  const filaRef = useRef<HTMLDivElement | null>(null);
  const [anchoDeLaFila, setAnchoDeLaFila] = useState(0);
  useEffect(() => {
    const fila = filaRef.current;
    if (!fila) return;
    const medir = () => setAnchoDeLaFila(fila.getBoundingClientRect().width);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(fila);
    return () => observador.disconnect();
  }, []);

  // Mientras la fila SALE por el borde tras un deslizado completo, nadie la
  // devuelve a su sitio: al aplicar la acción la fila deja de estar «abierta»,
  // y si estaba abierta de antes esta regla la traía de golpe a 0 y el botón
  // nunca llegaba a cubrirla entera.
  const saliendo = useRef(false);
  useEffect(() => { if (!arrastre.current && !saliendo.current) setDx(abierta ? -ancho : 0); }, [abierta, ancho]);

  // EL PUNTO DE NO RETORNO ES UNO SOLO: donde los botones dejan su ancho de
  // reposo y la acción empieza a crecer. Ahí se esconde «Más», vibra, y soltar
  // aplica. Antes el botón ya crecía y la acción pedía el 55 % de la fila: en
  // ese tramo se veía «va a pasar» y al soltar se cancelaba.
  const pasaElPunto = (valor: number) => valor < 0
    ? Boolean(onCompletarDerecha) && -valor >= ancho + MARGEN_DEL_PUNTO
    : Boolean(onCompletarIzquierda && accionesIzquierda) && valor >= anchoIzquierda + MARGEN_DEL_PUNTO;

  const alBajar = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    if (onPulsacionLarga) {
      cancelarPulsacion();
      temporizador.current = window.setTimeout(() => { temporizador.current = null; vibrarSuave(); onPulsacionLarga(); }, 500);
    }
    arrastre.current = { id: event.pointerId, x: event.clientX, y: event.clientY, base: dxRef.current, eje: "" };
    movido.current = false;
    setArrastrando(true);
  };
  const alMover = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = arrastre.current;
    if (!d || event.pointerId !== d.id) return;
    const pasoX = event.clientX - d.x;
    const pasoY = event.clientY - d.y;
    if (Math.abs(pasoX) > 6 || Math.abs(pasoY) > 6) cancelarPulsacion();
    if (!d.eje) {
      if (Math.abs(pasoX) < 6 && Math.abs(pasoY) < 6) return;
      d.eje = Math.abs(pasoX) > Math.abs(pasoY) ? "x" : "y";
      if (d.eje === "y") { arrastre.current = null; setArrastrando(false); return; }
    }
    movido.current = true;
    const crudo = d.base + pasoX;
    // Hacia la izquierda se puede llegar HASTA EL BORDE —ahí la acción se
    // aplica sola, como en WhatsApp—; hacia la derecha, solo si esa mano tiene
    // acciones. Pasado el tope se avanza a un cuarto: se siente el límite.
    const topeIzq = -(anchoDeLaFila || ancho);
    const topeDer = accionesIzquierda ? (anchoDeLaFila || anchoIzquierda) : 0;
    // Hacia un lado SIN acciones la fila no se mueve nada —ni el cuarto de
    // resorte—: moverse insinúa que ahí hay algo.
    const sinAccionAlaDerecha = !accionesIzquierda && crudo > 0;
    const tope = sinAccionAlaDerecha ? 0
      : crudo < topeIzq ? topeIzq + (crudo - topeIzq) / 4
      : crudo > topeDer ? topeDer + (crudo - topeDer) / 4
      : crudo;
    if (pasaElPunto(dxRef.current) !== pasaElPunto(tope)) vibrarSuave();
    // Al instante, no después del pintado: un dedo que suelta rápido leía la
    // posición anterior y la acción se cancelaba.
    dxRef.current = tope;
    setDx(tope);
  };
  const alSoltar = (cancelado: boolean) => {
    cancelarPulsacion();
    setArrastrando(false);
    if (!arrastre.current) return;
    arrastre.current = null;
    if (cancelado) { setDx(abierta ? -ancho : 0); onEstado(abierta); return; }
    const final = dxRef.current;
    // Pasado el punto en que el botón crece, soltar APLICA la acción; no hace
    // falta llegar al borde. Como WhatsApp: la fila termina de salir por el borde y recién entonces
    // se aplica. Archivar la quita de la lista; leído/no leído la regresa.
    if (final < 0 && pasaElPunto(final)) {
      saliendo.current = true;
      setDx(-anchoDeLaFila); onEstado(false);
      // Sale por el borde, y luego la fila se cierra suave: la de abajo sube a
      // ocupar su lugar en vez de saltar.
      window.setTimeout(() => {
        const fila = filaRef.current;
        if (fila) {
          fila.style.height = `${fila.offsetHeight}px`;
          void fila.offsetHeight;
          fila.style.transition = `height ${CERRAR_MS}ms ${CURVA_IOS}`;
          fila.style.height = "0px";
        }
        window.setTimeout(() => {
          onCompletarDerecha?.();
          if (fila) { fila.style.height = ""; fila.style.transition = ""; }
          saliendo.current = false;
          setDx(0);
        }, CERRAR_MS);
      }, SALIR_MS);
      return;
    }
    if (final > 0 && pasaElPunto(final)) {
      saliendo.current = true;
      setDx(anchoDeLaFila); onEstado(false);
      window.setTimeout(() => { onCompletarIzquierda?.(); saliendo.current = false; setDx(0); }, SALIR_MS);
      return;
    }
    // Hacia la derecha no hay estado «abierto»: o se deslizó hasta el final y
    // se aplica, o la fila vuelve a su sitio. Es la mano de una sola acción.
    if (final > 0) { setDx(0); onEstado(false); return; }
    const abrir = final < -ancho / 2;
    setDx(abrir ? -ancho : 0);
    onEstado(abrir);
  };

  return (
    // select-none + sin callout: dejar el dedo quieto abría el menú de iOS
    // (Copiar / Buscar / Traducir) encima de la hoja de acciones.
    <div ref={filaRef} className={cn("relative select-none overflow-hidden bg-white [-webkit-touch-callout:none]", className)}>
      {/* El fondo de la acción crece con el dedo y llega hasta el borde: al
          deslizar hasta el final no queda un pedazo vacío detrás de la fila,
          y el icono viaja con él en vez de quedarse clavado en su casilla. */}
      {/* Solo se pinta la mano hacia la que se está deslizando. Con las dos
          montadas, al correr la fila hacia un lado asomaban por el otro los
          botones que no correspondían. */}
      {/* Solo mientras se desliza (dx < 0): montado en reposo, sus bordes
          asomaban como líneas finas a la derecha de cada fila. */}
      {dx < 0 && (
        <div
          className="absolute inset-y-0 right-0 flex justify-end overflow-hidden"
          // Con el dedo, el ancho sigue al dedo; al soltar pasado el punto de
          // no retorno, el botón termina de crecer ANIMADO hasta cubrir la
          // fila entera, al mismo paso que la fila sale.
          style={{ width: Math.max(ancho, Math.min(-dx, anchoDeLaFila || ancho)), transition: arrastrando ? "none" : `width ${SALIR_MS}ms ${CURVA_IOS}` }}
        >
          {acciones(pasaElPunto(dx))}
        </div>
      )}
      {accionesIzquierda && dx > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex overflow-hidden"
          style={{ width: Math.max(anchoIzquierda, Math.min(dx, anchoDeLaFila || anchoIzquierda)), transition: arrastrando ? "none" : `width ${SALIR_MS}ms ${CURVA_IOS}` }}
        >
          {accionesIzquierda(pasaElPunto(dx))}
        </div>
      )}
      <div
        className="relative bg-white"
        style={{ transform: `translateX(${dx}px)`, transition: arrastrando ? "none" : `transform ${SALIR_MS}ms ${CURVA_IOS}`, touchAction: "pan-y" }}
        onContextMenu={onContextMenu}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={() => alSoltar(false)}
        onPointerCancel={() => alSoltar(true)}
        onClickCapture={(event) => { if (movido.current) { event.preventDefault(); event.stopPropagation(); movido.current = false; } }}
      >
        {children}
        {resaltada && <span aria-hidden className="pointer-events-none absolute inset-0 bg-[#009FD9]/10" />}
      </div>
    </div>
  );
}
