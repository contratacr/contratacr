"use client";

import { useEffect, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * «HAY MÁS HACIA ALLÁ», para cualquier fila que se desplace de lado.
 *
 * SOLO EN COMPUTADORA, Y SOLO AL PASAR EL CURSOR. Es lo que hacen las apps que
 * viven de esto —YouTube, Google, Airbnb—: con el dedo la fila se arrastra y
 * una flecha siempre puesta es un botón de más que tapa justo la opción que
 * anuncia; con el ratón no hay gesto de arrastre, así que ahí sí hace falta un
 * punto donde hacer clic, pero aparece cuando la mano se acerca.
 *
 * En el teléfono la señal es otra, y es la que usan todas: que SE VEA media
 * pastilla cortada en el borde. Eso invita a arrastrar mejor que cualquier
 * flecha, y de eso se encargan `asomoMinimo` (ScrollRail) y el degradado
 * (useDesvanecidoDeCarril).
 *
 * Se pone como HERMANA del carril, dentro de un contenedor `relative` —si fuera
 * hija, se iría con el desplazamiento—. Mide ella sola, así sirve igual para
 * `ScrollRail` que para las filas que se desplazan por su cuenta.
 */
export function FlechasDeCarril({ carril, enMargen = false }: {
  carril: RefObject<HTMLElement | null>;
  /** En computadora la flecha vive en un margen propio del contenedor, no sobre el carril. */
  enMargen?: boolean;
}) {
  const [puede, setPuede] = useState({ izquierda: false, derecha: false });
  const [centro, setCentro] = useState<number | null>(null);

  useEffect(() => {
    const fila = carril.current;
    if (!fila) return;
    // Se mide en el cuadro siguiente: hacerlo dentro del efecto encadena
    // renders, y aquí no corre prisa —es un adorno del borde—.
    const medir = () => requestAnimationFrame(() => {
    if (!carril.current) return;
    const desplaza = /(auto|scroll)/.test(getComputedStyle(fila).overflowX);
    const max = fila.scrollWidth - fila.clientWidth;
    setPuede({ izquierda: desplaza && fila.scrollLeft > 2, derecha: desplaza && max > 2 && fila.scrollLeft < max - 2 });
    // El centro de las PASTILLAS, no el de la fila: varias llevan relleno abajo
    // y la flecha quedaba descentrada respecto de lo que señala.
    const contenedor = fila.parentElement;
    const primera = (fila.children.length === 1 && fila.children[0].children.length > 1 ? fila.children[0].firstElementChild : fila.firstElementChild) as HTMLElement | null;
    if (contenedor && primera) {
      const r = primera.getBoundingClientRect();
      setCentro(Math.round(r.top - contenedor.getBoundingClientRect().top + r.height / 2));
    }
    });
    medir();
    fila.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(fila);
    Array.from(fila.children).forEach((hijo) => observador.observe(hijo));
    // Las opciones pueden llegar o irse después (conteos, servicios nuevos).
    const cambios = new MutationObserver(medir);
    cambios.observe(fila, { childList: true, subtree: true });
    window.addEventListener("resize", medir);
    return () => {
      fila.removeEventListener("scroll", medir);
      observador.disconnect();
      cambios.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [carril]);

  const desplazar = (lado: "izquierda" | "derecha") => {
    const fila = carril.current;
    if (!fila) return;
    const paso = Math.max(160, fila.clientWidth * 0.7);
    fila.scrollBy({ left: lado === "derecha" ? paso : -paso, behavior: "smooth" });
  };

  return (
    <>
      {(["izquierda", "derecha"] as const).map((lado) => puede[lado] && (
        <button
          key={lado}
          type="button"
          data-flecha-carril={lado}
          // Marca compartida: «este botón no es una opción del filtro», que es
          // como las pruebas cuentan las opciones de verdad.
          data-rail-hint=""
          aria-label={lado === "derecha" ? "Ver más opciones" : "Ver opciones anteriores"}
          onClick={(e) => { e.stopPropagation(); desplazar(lado); }}
          // La posición va en `style`: es geometría que tiene que estar bien
          // aunque la hoja de utilidades llegue tarde.
          // Medio botón fuera del carril: dentro tapaba el rótulo de la opción
          // que asoma («Emple…» detrás de la flecha), que es justo lo que la
          // flecha viene a anunciar. Así se ve la flecha Y se lee la opción.
          style={{ position: "absolute", top: centro ?? "50%", transform: "translateY(-50%)", [lado === "derecha" ? "right" : "left"]: -10, zIndex: 10 }}
          className={cn(
            "hidden h-7 w-7 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#162543] shadow-[0_2px_8px_-2px_rgba(15,23,42,0.35)] transition-opacity duration-150",
            // Con ratón: aparece cuando la mano se acerca al carril.
            "lg:grid lg:opacity-0 lg:group-hover/carril:opacity-100 lg:focus-visible:opacity-100 hover:bg-[#eef5f9]",
            // CON EL DEDO: SIEMPRE A LA VISTA mientras haya a dónde ir.
            // La idea era que en el teléfono bastara con ver media pastilla
            // cortada, y funciona cuando de verdad asoma media. Donde la fila
            // no pasa por `ScrollRail` no hay quien fuerce ese asomo, y la
            // pastilla siguiente se queda en un hilo de 8 px contra el filo:
            // medido en los servicios de un caso de éxito. Sin flecha y sin
            // asomo no queda ninguna señal, así que aquí sí se dibuja.
            "max-lg:[@media(hover:none)]:grid max-lg:[@media(hover:none)]:opacity-100",
            enMargen && (lado === "derecha" ? "lg:!right-0" : "lg:!left-0"),
          )}
        >
          {lado === "derecha" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      ))}
    </>
  );
}
