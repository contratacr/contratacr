import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * La caja de icono de la marca: un cuadrado redondeado con degradado suave y el
 * icono dibujado a línea encima. Es la misma pieza de las tarjetas de «¿Cómo
 * quieres empezar?», en pequeño, y por eso la usan por igual los estados
 * vacíos, los avisos y los diálogos: un solo lenguaje en toda la app.
 *
 * Antes era un círculo celeste plano con el icono en azul claro, que sobre
 * blanco casi no se veía.
 *
 * CUÁNDO LLEVA CAJA Y CUÁNDO NO (regla del app, para no decidirlo por pantalla):
 *
 *  · CON caja —esta pieza, o la clase `.ccr-icono-mosaico` que la repite en CSS
 *    para los estados vacíos—: cuando el icono es el PROTAGONISTA de un bloque y
 *    está solo. Estados vacíos, diálogos, avisos, tarjetas de elección.
 *
 *  · SIN caja, a línea, de 16 a 18 px: cuando el icono ACOMPAÑA a un texto
 *    dentro de un botón, una fila o una etiqueta —«WhatsApp», «Llamar»,
 *    «Guardar», «Compartir»—. Ahí el protagonista es el texto, y una caja
 *    dentro de una píldora es una caja dentro de otra.
 *
 *  · Las marcas ajenas (WhatsApp, Instagram, Facebook, TikTok) NUNCA llevan caja
 *    ni cambian de color: son marcas de otro, se usan como son.
 *
 * `tone` "brand" = azul de marca (por defecto); "success" = verde;
 * "warning" = ámbar; "danger" = rojo. `size` es el lado de la caja en píxeles.
 */
export function BrandIconBadge({
  icon: Icon,
  size = 64,
  tone = "brand",
  className,
}: {
  icon: LucideIcon;
  size?: number;
  tone?: "brand" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    brand: "bg-[linear-gradient(135deg,#eaf6fc_0%,#cbe8f6_55%,#f0f8fd_100%)] text-[#162543]",
    success: "bg-[linear-gradient(135deg,#e8f7ef_0%,#c3ead6_55%,#f0faf5_100%)] text-[#0f7a52]",
    warning: "bg-[linear-gradient(135deg,#fdf3e0_0%,#f7e0b5_55%,#fdf8ee_100%)] text-[#9a6400]",
    danger: "bg-[linear-gradient(135deg,#fdecec_0%,#f7cfcf_55%,#fdf4f4_100%)] text-[#b42318]",
  };
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-grid shrink-0 place-items-center shadow-[0_12px_26px_-18px_rgba(15,23,42,0.55)]",
        tones[tone],
        className,
      )}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <Icon style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.46) }} strokeWidth={1.6} />
    </span>
  );
}
