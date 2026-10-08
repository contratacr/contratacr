import { VerifiedSeal } from "@/components/ui/verified-seal";
import { cn } from "@/lib/utils";

/** En las listas y tarjetas va en 12 px, como el texto de su renglón, pero en
 *  un gris más oscuro que el resto: es lo que da confianza. */
export const CEDULA_COMPACTA = "text-[12px] font-semibold leading-none text-[#4b5b70]";

/**
 * «✓ Cédula verificada», la MISMA línea en todo el app (8-oct-2026): ficha,
 * panel, tarjetas de /profesionales, empleos y promociones. Va en su propia
 * línea debajo del nombre y solo cuando la cédula está verificada; sin
 * verificar no se pinta nada. Antes cada pantalla tenía su versión (12,5 o
 * 13 px, normal o medio, 4 o 6 px de separación) y se notaba al pasar de una
 * a otra. El texto lo trae quien la usa porque sirve en componentes de
 * servidor y de cliente.
 */
export function CedulaVerificada({ texto, className }: { texto: string; className?: string }) {
  return (
    <span
      data-cedula-verificada
      className={cn("flex items-center gap-1 text-[13px] font-medium leading-5 text-[#4b5b70]", className)}
    >
      <VerifiedSeal className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />
      {texto}
    </span>
  );
}
