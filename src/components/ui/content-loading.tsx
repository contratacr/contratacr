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
      <div className="mx-auto w-full max-w-xl space-y-3">
        <Skeleton className="h-4 w-2/5 rounded-full" />
        <Skeleton className="h-3 w-4/5 rounded-full" />
        <Skeleton className="h-3 w-3/5 rounded-full" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export function PanelListSkeleton({
  rows = 3,
  withTabs = false,
  withSearch = false,
  hasData = false,
  className,
}: {
  rows?: number;
  withTabs?: boolean;
  withSearch?: boolean;
  /** Only draw record-shaped placeholders when this section already has records. */
  hasData?: boolean;
  className?: string;
}) {
  const t = useTranslations("loading");
  if (!hasData) {
    // The first request cannot know whether this collection is empty yet. Keep
    // a visible, stable loading surface in the panel instead of returning null:
    // returning null leaves the section header above a blank card until the
    // network request resolves (and can last several seconds on a cold load).
    return <PanelSectionLoading className={className} />;
  }

  return (
    <div data-panel-loading="" className={cn("ccr-delayed-loading space-y-4", className)} aria-busy="true" role="status">
      <span className="sr-only">{t("generic")}</span>
      {withSearch && (
        <div className="rounded-2xl border border-[#e5edf4] bg-white p-3 shadow-sm">
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      )}
      {withTabs && (
        <div className="flex w-full max-w-md gap-1 rounded-2xl bg-[#eef3f7] p-1">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-[#dfe8f0] bg-white p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.7)] sm:p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <Skeleton className="h-4 w-2/3 rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
                <Skeleton className="h-3 w-5/6 rounded-full" />
              </div>
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
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
}: {
  icon: ElementType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ccr-empty-state flex flex-col items-center justify-center px-5 py-10 text-center", className)}>
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
}: {
  icon: ElementType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ccr-empty-state flex min-h-[20rem] flex-col items-center justify-center px-7 py-12 text-center sm:min-h-[22rem]", className)}>
      {/* El mismo lenguaje que las tarjetas de crear cuenta: el icono a línea
          dentro de un mosaico azul, título marino y una línea de apoyo. */}
      <span className="ccr-icono-mosaico h-16 w-16">
        <Icon className="h-7 w-7" strokeWidth={1.6} />
      </span>
      <h2 className="mt-4 text-lg font-extrabold text-[#162543]">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-6 text-[#68778d]">{description}</p>}
      {/* En un estado vacío la acción ES la pantalla: ancha, centrada y con
          altura cómoda. Con lista, en cambio, el botón de crear va compacto
          arriba para no competir con el contenido. */}
      {action && (
        <div className="mt-5 flex w-full max-w-xs justify-center [&>a]:h-11 [&>a]:w-full [&>button]:h-11 [&>button]:w-full">
          {action}
        </div>
      )}
    </div>
  );
}
