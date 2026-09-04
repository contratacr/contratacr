"use client";

import { cn } from "@/lib/utils";
import { useHairlineOnScroll } from "@/components/util/use-hairline-on-scroll";

// Encabezado pegajoso cuya línea (y sombra) solo aparecen cuando hay contenido
// pasando por debajo — para páginas de servidor que no pueden usar el gancho
// directamente. Pinta el centinela y el <header>; el contenido va dentro.
export function StickyHairlineHeader({
  className,
  shadow = false,
  children,
}: {
  className?: string;
  /** Sombra suave al desplazar, además de la línea. */
  shadow?: boolean;
  children: React.ReactNode;
}) {
  const { sentinelaRef, cabeceraRef, desplazado, conLinea } = useHairlineOnScroll();
  return (
    <>
      <div ref={sentinelaRef} aria-hidden className="h-px lg:hidden" />
      <header
        ref={cabeceraRef}
        className={cn(
          "sticky top-0 border-b bg-white transition-[border-color,box-shadow] duration-200",
          conLinea ? "border-[#e5e7eb]" : "border-transparent",
          shadow && desplazado && "shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
          className,
        )}
      >
        {children}
      </header>
    </>
  );
}
