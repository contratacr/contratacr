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
  conBorde = false,
  className,
  testId,
}: {
  titulo: ReactNode;
  ayuda?: ReactNode;
  checked: boolean;
  onChange: (valor: boolean) => void;
  disabled?: boolean;
  /** Dentro de su propia caja, cuando la opción va sola en el formulario. */
  conBorde?: boolean;
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
        "flex w-full items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/35 disabled:cursor-not-allowed disabled:opacity-60",
        conBorde ? "rounded-2xl border border-[#e3ebf2] bg-white px-4 py-3" : "py-1",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#162543]">{titulo}</span>
        {ayuda && <span className="mt-0.5 block text-[13px] leading-snug text-[#68778d]">{ayuda}</span>}
      </span>
      <ToggleSwitch checked={checked} disabled={disabled} />
    </button>
  );
}
