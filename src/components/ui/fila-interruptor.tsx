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
  estirar = false,
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
  /** Dentro de una lista: la fila se estira para que todos los interruptores se alineen. */
  estirar?: boolean;
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
        // EL INTERRUPTOR VA PEGADO A SU TEXTO y la fila mide lo que ocupa.
        // Antes se estiraba a todo el ancho y `justify-between` mandaba el
        // interruptor al filo: en computadora el rótulo quedaba a la izquierda
        // y el control a casi mil píxeles. Sin caja pintada: no es una
        // tarjeta, es una opción. ESTE es el único dibujo del app.
        "inline-flex min-h-11 w-fit max-w-full flex-col items-start justify-center py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/35 disabled:cursor-not-allowed disabled:opacity-60",
        // EN UNA LISTA, TODOS SE ALINEAN. Cada rótulo mide distinto, así que
        // filas sueltas dejan los interruptores en zigzag. Al estirarlas dentro
        // de una columna que mide lo que la palabra más larga, caen todos en la
        // misma vertical sin alejarse del texto.
        estirar && "w-full",
        className,
      )}
    >
      {/* EL INTERRUPTOR VIVE EN EL RENGLÓN DEL TÍTULO, no centrado entre las
          dos líneas: con una ayuda debajo quedaba flotando a media altura,
          sin nada a su lado con qué alinearse. */}
      <span className={cn("inline-flex max-w-full items-center gap-3", estirar && "w-full justify-between")}>
        <span className="min-w-0 text-sm font-semibold text-[#162543]">{titulo}</span>
        {cargando ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#009FD9]" /> : <ToggleSwitch checked={checked} disabled={disabled} />}
      </span>
      {ayuda && <span className="mt-0.5 block text-[13px] leading-snug text-[#68778d]">{ayuda}</span>}
    </button>
  );
}
