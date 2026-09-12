"use client";

import { VerifiedSeal } from "@/components/ui/verified-seal";

/**
 * Nombre en UNA sola línea con el sello de verificado pegado al final.
 *
 * Regla de las tarjetas: el nombre ocupa todo el ancho que le deja la fila
 * (hasta el ícono de guardar), y solo cuando de verdad no cabe se corta con
 * «…»; el sello nunca se pierde ni salta de línea porque no encoge. Antes se
 * medía el texto en un canvas y el enlace era `inline-block`: el ancho
 * disponible se calculaba sobre el propio texto ya recortado y los nombres
 * largos quedaban cortados con espacio de sobra a la derecha.
 *
 * El contenedor que lo envuelve debe ser de bloque o `flex-1 min-w-0` para
 * que el ancho sea el de la fila y no el del texto.
 */
export function ResponsiveVerifiedName({
  name,
  verified,
  verifiedLabel,
}: {
  name: string;
  verified: boolean;
  verifiedLabel: string;
}) {
  return (
    <span className="flex w-full min-w-0 items-center">
      <span className="min-w-0 truncate">{name}</span>
      {verified && (
        <VerifiedSeal
          label={verifiedLabel}
          className="ml-1 h-3.5 w-3.5 shrink-0 text-[#009FD9]"
        />
      )}
    </span>
  );
}
