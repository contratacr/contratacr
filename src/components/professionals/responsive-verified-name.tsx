"use client";

import { VerificationInfo } from "@/components/ui/verification-info";
import { Link } from "@/i18n/navigation";

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
  href,
}: {
  name: string;
  verified: boolean;
  verifiedLabel: string;
  href?: string;
}) {
  return (
    <span className="flex w-full min-w-0 items-center">
      {href ? <Link href={href} className="min-w-0 truncate hover:text-[#009FD9]">{name}</Link> : <span className="min-w-0 truncate">{name}</span>}
      {verified && <VerificationInfo />}
    </span>
  );
}
