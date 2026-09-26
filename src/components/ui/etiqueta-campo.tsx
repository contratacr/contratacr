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
