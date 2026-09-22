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
        // SIN CAJA PINTADA. Un interruptor que vive entre campos de un
        // formulario no es una tarjeta: es un campo mas, y el recuadro con su
        // tinte lo hacia pesar mas que los telefonos y los textos de al lado.
        // Lo que sustituye a la caja es la MEDIDA: la fila toma el mismo ancho
        // que sus vecinos, asi que el interruptor nunca se va al otro extremo
        // de una fila de 768 px, que era el problema que la caja resolvia.
        //
        // Rotulo a la izquierda e interruptor a la DERECHA, no pegado al texto:
        // con dos o mas seguidos, pegarlos al rotulo los deja en zigzag —cada
        // uno a una distancia distinta segun lo largo del texto— y la guia de
        // Material lo dice explicito, que en una lista de ajustes los controles
        // se alinean en un eje vertical. Encendido lo dice el propio
        // interruptor, que se pone celeste; para eso esta.
        "flex min-h-11 w-full items-center justify-between gap-4 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/35 disabled:cursor-not-allowed disabled:opacity-60",
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
