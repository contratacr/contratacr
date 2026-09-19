import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * El «listo» después de crear algo —un proyecto, un tiquete—, en un solo
 * lugar. Cada ventana lo dibujaba por su cuenta y salían parecidos pero no
 * iguales: el círculo con un ícono de 32 px aquí y de 36 allá, el título en un
 * tamaño distinto, los botones de alto distinto.
 *
 * Las acciones van aparte (el pie de la ventana) con `BOTON_DE_EXITO`, para que
 * todas midan lo mismo: 48 px, a todo el ancho en el teléfono y a su tamaño en
 * computadora.
 */
export const BOTON_DE_EXITO = "h-12 w-full sm:w-auto sm:px-6";

export function PantallaDeExito({ titulo, children, acciones, className }: { titulo: ReactNode; children?: ReactNode; acciones?: ReactNode; className?: string }) {
  return (
    <div data-pantalla-de-exito role="status" className={cn("flex flex-col items-center justify-center gap-4 px-6 py-10 text-center sm:py-12", className)}>
      <div className="grid h-16 w-16 place-items-center rounded-full ccr-caja-icono">
        <CheckCircle2 className="h-9 w-9 text-[#009FD9]" aria-hidden="true" />
      </div>
      <h3 className="text-xl font-bold text-[#162543]">{titulo}</h3>
      {children}
      {acciones && <div className="mt-2 flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row sm:justify-center">{acciones}</div>}
    </div>
  );
}
