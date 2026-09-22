"use client";

import type { ReactNode } from "react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { cn } from "@/lib/utils";

/**
 * Una opción de sí/no: el rótulo a la izquierda y el interruptor a la derecha,
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
  className,
  testId,
}: {
  titulo: ReactNode;
  ayuda?: ReactNode;
  checked: boolean;
  onChange: (valor: boolean) => void;
  disabled?: boolean;
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
        // UNA SOLA CAJA PARA TODOS LOS INTERRUPTORES, la que ya usaba Idiomas:
        // rotulo a la izquierda, interruptor a la derecha y un recuadro que los
        // encierra a los dos. Sueltos sobre el formulario pasaba una de dos
        // cosas —o el interruptor se iba al otro extremo de una fila de 768 px,
        // o quedaba pegado al texto sin nada que los uniera—; la caja resuelve
        // las dos, porque marca hasta donde llega la opcion. Encendida se tine
        // de celeste, asi que el estado se lee de lejos sin mirar la perilla.
        // Mide lo MISMO que los campos de su formulario —ni un tope propio—:
        // con 36rem la caja sobresalia por la derecha de los telefonos de
        // arriba y de abajo, y una fila mas larga que sus vecinas se lee como
        // si perteneciera a otra cosa.
        "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/30 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "border-[#cce8f3] bg-[#f4fbfe]" : "border-[#e5e7eb] bg-white hover:bg-[#f8fafc]",
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
      <ToggleSwitch checked={checked} disabled={disabled} />
    </button>
  );
}
