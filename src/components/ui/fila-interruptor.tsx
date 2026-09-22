"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { cn } from "@/lib/utils";

/**
 * Una opción de sí/no: el rótulo y, pegado a él, el interruptor,
 * el mismo de «Permitir llamadas». Había tres dibujos para lo mismo —casilla
 * nativa, casilla pintada a mano e interruptor— según quién escribió cada
 * pantalla. Una casilla queda para lo que SÍ es una casilla: aceptar términos
 * o marcar varias opciones de una lista.
 */
export function FilaInterruptor({
  titulo,
  ayuda,
  checked,
  onChange,
  disabled = false,
  cargando = false,
  className,
  testId,
}: {
  titulo: ReactNode;
  ayuda?: ReactNode;
  checked: boolean;
  onChange: (valor: boolean) => void;
  disabled?: boolean;
  /** Mientras guarda, el interruptor se cambia por la rueda. */
  cargando?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cn(
        // EL INTERRUPTOR VA PEGADO A SU TEXTO, en UNA sola línea, y la fila
        // mide lo que ocupa. Antes se estiraba a todo el ancho y
        // `justify-between` mandaba el interruptor al filo: en computadora el
        // rótulo quedaba a la izquierda y el switch a casi mil píxeles, y
        // había que recorrer la fila con la vista para saber qué se estaba
        // encendiendo. La alineación en eje vertical que eso buscaba costaba
        // más de lo que daba. Sin caja pintada: no es una tarjeta, es una
        // opción. ESTE es el único dibujo de un interruptor en el app.
        "inline-flex min-h-11 w-fit max-w-full items-center gap-3 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/35 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#162543]">{titulo}</span>
        {ayuda && <span className="mt-0.5 block text-[13px] leading-snug text-[#68778d]">{ayuda}</span>}
      </span>
      {/* EL INTERRUPTOR VA CENTRADO EN LA FILA, tambien cuando hay una linea
          de ayuda debajo. Estuvo pegado al renglon del titulo y con dos
          renglones quedaba arriba, con un hueco debajo: la caja se veia
          desbalanceada. Material 3 y los Ajustes de iOS centran el control de
          la derecha en toda la celda, no en su primera linea, y es lo que se
          reconoce como una fila de ajuste. */}
      {cargando ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#009FD9]" /> : <ToggleSwitch checked={checked} disabled={disabled} />}
    </button>
  );
}
