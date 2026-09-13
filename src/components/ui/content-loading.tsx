"use client";

import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { LoadingMarkImage } from "@/components/ui/loading-mark-image";

export function Skeleton({ className }: { className: string }) {
  return <span aria-hidden className={`ccr-delayed-loading ccr-skeleton-shimmer block ${className}`} />;
}

export function BrandLoadingMark({ className, children }: { className?: string; children?: ReactNode } = {}) {
  const t = useTranslations("loading");
  return (
    <div className={cn("grid place-items-center", className)} aria-busy="true" role="status">
      <LoadingMarkImage />
      {children ?? <span className="sr-only">{t("generic")}</span>}
    </div>
  );
}

export function PanelSectionLoading({ title, description, className }: { rows?: number; title?: ReactNode; description?: ReactNode; className?: string } = {}) {
  const t = useTranslations("loading");
  // Sin ruedita: la espera se dibuja como skeleton. Barras neutras, no
  // tarjetas, porque aún no se sabe si la sección tendrá registros.
  return (
    <div data-panel-loading="" className={cn("ccr-delayed-loading ccr-panel-section-loading min-h-[14rem] px-4 py-6 sm:min-h-[16rem]", className)} aria-busy="true" role="status">
      <span className="sr-only">{title ?? t("generic")}</span>
      {description && <span className="sr-only">{description}</span>}
      <div className="mx-auto w-full max-w-xl space-y-3 lg:max-w-none">
        <Skeleton className="h-4 w-2/5 rounded-full lg:w-1/4" />
        <Skeleton className="h-3 w-4/5 rounded-full lg:w-1/2" />
        <Skeleton className="h-3 w-3/5 rounded-full lg:w-2/5" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}

// El esqueleto de una sección de lista tiene la forma de la sección: sus
// pestañas, su buscador y sus tarjetas, en teléfono y en escritorio.
//
// Antes solo dibujaba las tarjetas cuando la sección "ya tenía registros"
// (`hasData`), y caía al bloque genérico en caso contrario. Pero mientras se
// carga el dato todavía no existe, así que `hasData` era falso SIEMPRE y todas
// las secciones enseñaban el mismo bloque angosto pensado para el teléfono;
// en la computadora aparecía una columna estrecha que luego saltaba a la lista
// ancha. La sección sabe qué forma tiene aunque aún no sepa cuántas filas: eso
// es lo que se dibuja.
export function PanelListSkeleton({
  rows = 3,
  withTabs = false,
  withSearch = false,
  className,
}: {
  rows?: number;
  withTabs?: boolean;
  withSearch?: boolean;
  className?: string;
}) {
  const t = useTranslations("loading");

  return (
    <div data-panel-loading="" className={cn("ccr-delayed-loading space-y-4", className)} aria-busy="true" role="status">
      <span className="sr-only">{t("generic")}</span>
      {withSearch && (
        <div className="rounded-2xl border border-[#e5edf4] bg-white p-3 shadow-sm">
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      )}
      {withTabs && (
        // Misma geometría que `StatusFilterTabs`: pastilla segmentada de 36px, a lo ancho.
        <div className="flex w-full gap-1 rounded-xl bg-[#e6edf4] p-1">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 flex-1 rounded-lg" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          // La misma tarjeta que Citas, Proyectos y Empleos ya cargadas: ícono a
          // la izquierda, título y dos líneas de detalle, y la flecha de abrir a
          // la derecha. En escritorio las líneas son más cortas porque la fila
          // es ancha; la forma es la misma.
          <div key={index} className="rounded-2xl border border-[#dfe8f0] bg-white p-4 sm:p-5">
            <div className="flex items-start gap-3 lg:gap-4">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <Skeleton className="h-4 w-2/3 rounded-full lg:w-1/4" />
                <Skeleton className="h-3 w-1/2 rounded-full lg:w-1/3" />
                <Skeleton className="h-3 w-5/6 rounded-full lg:w-1/4" />
              </div>
              <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Vacío de UNA pestaña de filtro (Activas, Finalizadas…), no de la sección entera.
 * Es más bajo que `PanelEmptyState` y va en una caja punteada: se lee como
 * "esta vista está vacía", no como "no tienes nada". Con una línea gris suelta
 * la pantalla parecía rota.
 */
export function PanelFilterEmpty({
  icon: Icon,
  title,
  description,
  action,
  className,
  plano = false,
}: {
  icon: ElementType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** La pantalla que lo contiene ya es blanca: sin tarjeta, para no anidar dos. */
  plano?: boolean;
}) {
  return (
    <div className={cn(
      "ccr-empty-state flex flex-col items-center justify-center px-5 py-10 text-center",
      // Vacío con la misma superficie que la lista llena: sobre el gris del
      // panel, el texto suelto se leía como "esto no cargó".
      !plano && "rounded-2xl border border-[#e5eaf0] bg-white shadow-sm",
      className,
    )}>
      {/* Versión compacta del mismo vacío: mismo mosaico, misma tipografía. La
          caja punteada sobraba —el vacío ya se entiende— y hacía que esta
          pantalla no se pareciera a las demás. */}
      <span className="ccr-icono-mosaico h-14 w-14">
        <Icon className="h-6 w-6" strokeWidth={1.6} />
      </span>
      <p className="mt-3.5 text-base font-extrabold text-[#162543]">{title}</p>
      {description && <p className="mt-1.5 max-w-xs text-[13px] leading-6 text-[#68778d]">{description}</p>}
      {action && (
        <div className="mt-4 flex w-full max-w-[15rem] justify-center [&>a]:h-11 [&>a]:w-full [&>button]:h-11 [&>button]:w-full">
          {action}
        </div>
      )}
    </div>
  );
}

export function PanelEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  plano = false,
  tamano = "normal",
}: {
  icon: ElementType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** La pantalla que lo contiene ya es blanca: sin tarjeta, para no anidar dos. */
  plano?: boolean;
  /** "compacto" cuando el alto es caro y la acción tiene que verse sin
   *  desplazar: el panel de /buscar sobre el mapa, el menú de la campana, un
   *  hilo de chat vacío. Mismo dibujo, todo más chico. */
  tamano?: "normal" | "compacto";
}) {
  const compacto = tamano === "compacto";
  return (
    <div className={cn(
      "ccr-empty-state flex flex-col items-center justify-center text-center",
      compacto ? "min-h-[13rem] px-5 py-7" : "min-h-[20rem] px-7 py-12 sm:min-h-[22rem]",
      !plano && "rounded-2xl border border-[#e5eaf0] bg-white shadow-sm",
      className,
    )}>
      {/* El mismo lenguaje que las tarjetas de crear cuenta: el icono a línea
          dentro de un mosaico azul, título marino y una línea de apoyo. */}
      <span className={cn("ccr-icono-mosaico", compacto ? "h-12 w-12" : "h-16 w-16")}>
        <Icon className={compacto ? "h-5 w-5" : "h-7 w-7"} strokeWidth={1.6} />
      </span>
      <h2 className={cn("font-extrabold text-[#162543]", compacto ? "mt-3 text-base" : "mt-4 text-lg")}>{title}</h2>
      {description && <p className={cn("max-w-sm text-[#68778d]", compacto ? "mt-1 text-[13px] leading-5" : "mt-1.5 text-sm leading-6")}>{description}</p>}
      {/* En un estado vacío la acción ES la pantalla: ancha, centrada y con
          altura cómoda. Con lista, en cambio, el botón de crear va compacto
          arriba para no competir con el contenido. */}
      {action && (
        <div className={cn(
          "flex w-full max-w-xs justify-center",
          compacto ? "mt-4 [&>a]:h-10 [&>a]:w-full [&>button]:h-10 [&>button]:w-full" : "mt-5 [&>a]:h-11 [&>a]:w-full [&>button]:h-11 [&>button]:w-full",
        )}>
          {action}
        </div>
      )}
    </div>
  );
}
