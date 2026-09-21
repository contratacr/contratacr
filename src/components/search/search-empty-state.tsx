"use client";

import { Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PanelEmptyState } from "@/components/ui/content-loading";

/**
 * El vacío de /buscar, con el MISMO dibujo que el resto del app.
 *
 * Existe como componente de cliente porque `/buscar` es una página de servidor
 * y un icono no se puede pasar por las props a través de esa frontera; antes
 * por eso el vacío estaba copiado a mano y se había quedado con un mosaico de
 * 80px que empujaba el botón fuera de la pantalla.
 */
export function SearchEmptyState({ title, description, cta, href }: { title: string; description: string; cta: string; href: string }) {
  return (
    <div data-search-empty-state className="-mx-4 flex w-[calc(100%+2rem)] flex-col bg-white lg:mx-0 lg:w-full lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:shadow-sm">
      <PanelEmptyState
        plano
        icon={Search}
        title={title}
        description={description}
        className="flex-1 lg:min-h-[20rem] lg:px-8 lg:py-12"
        action={(
          <Link
            href={href}
            className="inline-flex items-center justify-center rounded-full bg-[#009FD9] px-6 text-sm font-bold text-white transition-colors hover:bg-[#0089bb]"
          >
            {cta}
          </Link>
        )}
      />
    </div>
  );
}
