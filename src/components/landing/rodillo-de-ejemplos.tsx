"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { oficiosDeArranque } from "@/lib/data/oficios-de-arranque";
import { cn } from "@/lib/utils";

/**
 * «Busca» FIJO Y EL SERVICIO RUEDA (3-oct-2026). Lo usan el buscador de la
 * portada y el que entra en la cabecera al bajar: es el mismo buscador, así
 * que dice lo mismo y se mueve igual.
 *  - Los ejemplos son «Los más buscados» del buscador completo (uno por grupo,
 *    solo donde hay profesionales) que caben enteros junto a «Busca».
 *  - El primero es siempre el de la lista fija: es el que pinta el servidor, y
 *    cambiarlo al montar sería un salto sin animación.
 *  - La palabra nueva aparece subiendo y fundiéndose (una sola a la vez), como un
 *    rodillo; cada 3 s, en 0,8 s. Se detiene con `quieto` (alguien escribe).
 */
export function RodilloDeEjemplos({ quieto = false, className }: { quieto?: boolean; className?: string }) {
  const t = useTranslations("landing.hero");
  const locale = useLocale();
  const [vuelta, setVuelta] = useState(0);
  const [lista, setLista] = useState<string[] | null>(null);
  useEffect(() => {
    const vivos = new Set(getAllCategories().map((c) => c.id));
    const nombres = oficiosDeArranque().filter((id) => vivos.has(id)).slice(0, 8)
      .map((id) => getCategoryLabel(id, locale)).filter(Boolean)
      .map((nombre) => nombre.charAt(0).toLocaleLowerCase(locale) + nombre.slice(1))
      .filter((nombre) => nombre.length <= 20);
    if (nombres.length >= 3) queueMicrotask(() => setLista(nombres));
  }, [locale]);
  useEffect(() => {
    if (quieto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Con la app en segundo plano o el menú abierto encima no se gira: el
    // teléfono pausa las animaciones ahí y el cambio quedaría a medias.
    const id = window.setInterval(() => { if (document.visibilityState === "visible" && !document.querySelector(".ccr-menu-completo.ccr-menu-abierto")) setVuelta((n) => n + 1); }, 3000);
    return () => window.clearInterval(id);
  }, [quieto]);
  const fija = t.raw("ejemplosBusqueda") as string[];
  const palabra = (i: number) => (i === 0 || !lista ? fija[i % fija.length] : lista[i % lista.length]);
  return (
    <span aria-hidden className={cn("flex min-w-0 items-center overflow-hidden", className)}>
      <span className="shrink-0">{t("buscaPrefijo")}&nbsp;</span>
      {/* RODILLO DE VERDAD, A PRUEBA DE PAUSAS (4-oct-2026): una columna con la
          palabra anterior y la nueva, en una ventana de UNA línea de alto, y
          se mueve la COLUMNA entera hacia arriba. Si Safari frena la animación
          (menú abierto, otra pestaña), la ventana sigue mostrando una sola
          palabra: nunca quedan dos a la vista. */}
      <span className="relative block h-[1.5em] min-w-0 overflow-hidden font-semibold leading-[1.5em] text-[#162543]">
        <span key={vuelta} className={cn("flex flex-col", vuelta > 0 && "ccr-rodillo-gira")}>
          {vuelta > 0 && <span className="h-[1.5em] whitespace-nowrap">{palabra(vuelta - 1)}</span>}
          <span className="h-[1.5em] whitespace-nowrap">{palabra(vuelta)}</span>
        </span>
      </span>
    </span>
  );
}
