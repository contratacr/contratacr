"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Cuántas franjas hay montadas a la vez. El pie vuelve cuando se va la última:
// una ficha puede montar la suya mientras la anterior todavía se desmonta.
let montadas = 0;

/**
 * Las acciones de una ficha —escribir, llamar, guardar— en su propia franja
 * pegada al fondo de la pantalla, igual que en Crear proyecto.
 *
 * En el teléfono quedaban al final del contenido: en una publicación larga
 * había que leerla entera para encontrar el botón, y en una corta el botón
 * flotaba a media pantalla. La acción que trajo a la persona no puede depender
 * de cuánto escribió quien publicó.
 *
 * Mientras la franja está puesta, el pie del sitio se esconde EN EL TELÉFONO:
 * quedaba justo detrás del botón, y es una lista de salidas —Servicios,
 * Soporte, redes— debajo de lo único que la pantalla pide hacer. En computadora
 * el pie se queda: ahí no hay franja fija, la ficha cabe y el pie sirve para
 * navegar.
 *
 * El aire de abajo lo reserva sola: publica su alto en --ccr-alto-barra y la
 * regla data-ccr-reserva (layout.tsx) se lo da al body en el teléfono. Quien la
 * use NO tiene que agregar su propio max-sm:pb-32.
 *
 * El relleno de abajo es generoso a propósito: Safari en iPhone tiñe su propia
 * barra con el color del borde inferior de la página, y con el botón verde
 * pegado al borde la barra del navegador se ponía verde. Con blanco de sobra
 * debajo, la barra se queda blanca.
 */
/**
 * Marca la pantalla mientras tiene una franja de acciones fija abajo, para que
 * el pie del sitio no quede detrás en el teléfono. Lo usan TODAS las franjas
 * —fichas, formularios de publicar, soporte y el registro profesional—, no
 * solo las de este componente: la regla es de la franja, no de la pantalla.
 */
/**
 * La medida de TODA franja de acciones pegada al fondo, en un solo lugar: la de
 * las fichas, la de soporte, la de publicar empleo o promoción y la del
 * registro profesional. Estaban escritas cuatro veces con rellenos distintos y
 * se veían parecidas pero no iguales.
 *
 * La referencia es la de «Cuéntanos qué necesitas» (publicar proyecto), que es
 * la que se ve bien: 20 px a los lados, para que el botón no llegue al filo de
 * la pantalla.
 *
 * El respiro de abajo es generoso a propósito, y por dos motivos. Safari en
 * iPhone tiñe su barra con el color del borde inferior de la página, así que un
 * botón de color pegado al borde se la pintaba de ese color. Y con la barra del
 * navegador a la vista, los últimos píxeles de la franja quedan justo contra
 * ella: con poco relleno los botones se ven pegados al filo.
 */
export const BARRA_ACCION_BASE =
  "ccr-pie-formulario ccr-barra-accion border-t border-[#e5e7eb] bg-white px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.75rem)]";

/**
 * La franja que además va PEGADA AL FONDO en el teléfono. La posición y la
 * caja no dependen de estas clases de Tailwind: las pone la regla escrita en
 * `src/app/layout.tsx`, que viaja dentro del documento. Las utilidades quedan
 * como respaldo y para computadora.
 */
export const BARRA_ACCION_FIJA = `${BARRA_ACCION_BASE} ccr-barra-fija`;

/**
 * El pie de una VENTANA —no el de la pantalla—: el de `Modal`, que es el que
 * usan casi todas. Las que se dibujaban solas cada una con lo suyo (agenda,
 * reserva, agregar servicio) quedaban con 4 px menos a los lados y con la línea
 * de arriba en otro gris: la misma ventana con dos medidas.
 *
 * Quien lo use pone su propio acomodo (`flex justify-end gap-3`, por ejemplo):
 * aquí van la caja y el respiro, que es lo que tiene que ser igual.
 */
export const PIE_VENTANA_BASE =
  "ccr-pie-ventana shrink-0 border-t border-[#f3f4f6] bg-white px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6 sm:pb-4";

export function useBarraAccionFija(activa = true) {
  useEffect(() => {
    if (!activa) return;
    montadas += 1;
    document.body.classList.add("ccr-con-barra-accion");
    return () => {
      montadas -= 1;
      if (montadas <= 0) {
        montadas = 0;
        document.body.classList.remove("ccr-con-barra-accion");
      }
    };
  }, [activa]);
}

/**
 * Igual que el anterior, pero solo cuenta si la franja se está VIENDO. Hay
 * pantallas que montan la versión de escritorio y la de teléfono a la vez y
 * esconden una con CSS: la escondida también marcaba la pantalla y el pie
 * desaparecía en una lista donde no hay ninguna franja —así se quedó Empleos
 * sin pie—.
 */
function useBarraAccionVisible(ref: React.RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(false);
  // Sin lista de dependencias a propósito: la franja se esconde y se vuelve a
  // mostrar según lo que traiga la ficha, y la marca del pie tiene que seguirla.
  useEffect(() => {
    const medir = () => {
      const nodo = ref.current;
      const alto = nodo ? nodo.getBoundingClientRect().height : 0;
      setVisible(alto > 0);
      // El alto real de la franja, para que la página reserve exactamente ese
      // espacio abajo (regla data-ccr-reserva en layout.tsx). Antes cada
      // pantalla lo reservaba a mano con max-sm:pb-32, y la que se olvidaba
      // —la ficha del profesional— dejaba lo último tapado por la franja.
      if (alto > 0) document.documentElement.style.setProperty("--ccr-alto-barra", `${Math.ceil(alto)}px`);
    };
    medir();
    const id = requestAnimationFrame(medir);
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", medir);
    };
  });
  useBarraAccionFija(visible);
}

/**
 * Una franja sin nada adentro no se dibuja. Quién contacta depende de los datos
 * de cada ficha —una promoción de un profesional sin WhatsApp y sin llamadas se
 * queda sin botones—, y la franja igual pintaba: una tira blanca de 45 px
 * pegada al fondo de la pantalla, con su línea arriba, prometiendo una acción
 * que no existe.
 *
 * Se busca la ACCIÓN en el árbol, no su alto: una franja escondida mide cero y
 * medir el alto la dejaría escondida para siempre. El observador la vuelve a
 * mirar cuando el botón llega tarde, que es lo normal —el dato de contacto se
 * pide aparte—.
 */
function useConAccion(ref: React.RefObject<HTMLDivElement | null>) {
  const [conAccion, setConAccion] = useState(true);
  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    // Se mira el `display` de cada acción, no su alto: con la franja escondida
    // todo mide cero, pero una acción que se esconde a sí misma dice `none`
    // aunque su contenedor también esté escondido.
    const mirar = () => setConAccion(
      Array.from(nodo.querySelectorAll<HTMLElement>("button, a, input, select, textarea, [role='button']"))
        .some((accion) => getComputedStyle(accion).display !== "none"),
    );
    mirar();
    const observador = new MutationObserver(mirar);
    observador.observe(nodo, { childList: true, subtree: true });
    window.addEventListener("resize", mirar);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", mirar);
    };
  }, [ref]);
  return conAccion;
}

export function AccionesAlPie({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const conAccion = useConAccion(ref);
  useBarraAccionVisible(ref);
  return (
    <div
      ref={ref}
      className={cn(
        "ccr-pie-formulario ccr-barra-accion ccr-barra-fija z-20 flex flex-col gap-2",
        // La misma franja que en soporte y en publicar: fija abajo en el
        // teléfono, con el mismo relleno.
        "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:border-t max-sm:border-[#e5e7eb] max-sm:bg-white max-sm:px-5 max-sm:pt-4 max-sm:pb-[calc(env(safe-area-inset-bottom)+1.75rem)]",
        className,
        // Al final a propósito: `cn` resuelve los choques por orden, y una
        // pantalla que pase su propio `flex` le ganaría al `hidden` si fuera
        // antes —la franja vacía de la ficha profesional volvería a pintarse—.
        !conAccion && "hidden",
      )}
    >
      {children}
    </div>
  );
}
