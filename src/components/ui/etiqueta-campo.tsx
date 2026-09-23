"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * Una sola forma de decir «obligatorio» y «opcional» en todo el app.
 *
 * La convención ya existía —asterisco rojo para lo obligatorio, «(opcional)»
 * gris para lo demás— pero estaba copiada a mano en cada formulario, y por eso
 * se olvidaba: la cotización y la reseña no marcaban NADA teniendo campos
 * obligatorios, y el «(opcional)» del campo de teléfono estaba escrito en
 * español a secas, así que salía en español también en inglés.
 *
 * El asterisco es decorativo para quien oye la pantalla: lo que de verdad
 * comunica la obligatoriedad es `aria-required` en el campo, no un símbolo.
 */
export function EtiquetaObligatoria({ children }: { children: ReactNode }) {
  return (
    <span>
      {children} <span aria-hidden className="text-red-500">*</span>
    </span>
  );
}

export function EtiquetaOpcional({ children }: { children: ReactNode }) {
  const t = useTranslations("inputs");
  return (
    <span>
      {children}{" "}
      <span className="font-normal text-[#68778d]">({t("optional")})</span>
    </span>
  );
}

/**
 * El error de un campo, pegado al campo. `data-campo-con-error` es lo que usan
 * los formularios para desplazarse al primero que falló, y `role="alert"` hace
 * que el lector de pantalla lo anuncie en cuanto aparece.
 */
export function ErrorDeCampo({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p data-campo-con-error="" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {children}
    </p>
  );
}

/**
 * Lleva la pantalla al primer campo que falló y le da el foco. Sin esto el
 * aviso puede quedar fuera de pantalla —varios formularios ponen el error
 * arriba y el botón abajo— y la persona ve que no pasa nada al guardar.
 */
export function irAlPrimerError(raiz?: HTMLElement | null) {
  if (typeof document === "undefined") return;
  const campo = (raiz ?? document).querySelector<HTMLElement>(
    '[data-campo-con-error], [aria-invalid="true"]',
  );
  if (!campo) return;
  const enfocable = campo.matches("input, textarea, select, button")
    ? campo
    : campo.closest("label, div")?.querySelector<HTMLElement>("input, textarea, select") ?? null;
  (enfocable ?? campo).scrollIntoView({ behavior: "smooth", block: "center" });
  enfocable?.focus({ preventScroll: true });
}

/**
 * El aviso de error que se trae la pantalla a sí mismo.
 *
 * Varios formularios ponen el banner ARRIBA y el botón de guardar ABAJO: en el
 * teléfono, con el teclado abierto, se tocaba «Guardar» y no pasaba nada
 * visible —el mensaje estaba fuera de pantalla—. Aquí, en cuanto cambia el
 * texto, el aviso se desplaza a la vista y el lector de pantalla lo anuncia.
 */
export function AvisoDeError({ children, className }: { children?: string | null; className?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (children) caja.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [children]);
  if (!children) return null;
  return (
    <div
      ref={caja}
      role="alert"
      className={className ?? "rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"}
    >
      {children}
    </div>
  );
}
