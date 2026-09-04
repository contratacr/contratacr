import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExpandToggle({ open, className }: { open: boolean; className?: string }) {
  return (
    <span
      className={cn(
        // Sin recuadro: la tarjeta ENTERA es el botón, y una caja con borde y
        // sombra hacía creer que solo se podía tocar ese círculo. La flecha
        // sola indica "esto se abre" y deja el protagonismo al contenido y a
        // la etiqueta de estado, que antes competían con ella. El área de
        // toque se mantiene en 36px para quien apunta directo a la flecha.
        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center transition-colors duration-200",
        open ? "text-[#009FD9]" : "text-[#9aa7b8] group-hover:text-[#0089bb]",
        className
      )}
      aria-hidden="true"
    >
      <ChevronDown
        className={cn(
          "h-5 w-5 stroke-[2.4] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          open && "rotate-180"
        )}
      />
    </span>
  );
}
