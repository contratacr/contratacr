"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// El enlace del perfil, a la vista y en una sola pieza: es corto
// (contratacr.com/nombre-apellido) y enseñarlo vende más que un botón que solo
// dice "copiar". Lo usan el kit del profesional y el compartir del perfil.
export function ShareLinkPanel({ url, label, copyLabel, copiedLabel }: {
  url: string;
  label: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const visible = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch { /* sin portapapeles: el enlace igual está a la vista */ }
  }

  return (
    // EL ENLACE MANDA, Y NO SE PARTE. Con el boton al lado, un nombre largo se
    // rompia a media palabra —«contratacr.com/rede / s-bahia-pruebas»— y lo que
    // se quiere ensenar quedaba feo. El enlace toma el renglon entero y el
    // boton va debajo, a todo el ancho: no hay donde fallar y el area de toque
    // es la mayor posible.
    <div className="rounded-2xl bg-gradient-to-br from-[#162543] to-[#1d3b63] p-3.5 text-left">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8fb8d8]">{label}</p>
      <p className="mt-1 text-[15px] font-extrabold leading-snug text-white [overflow-wrap:anywhere]">{visible}</p>
      <button
        type="button"
        onClick={() => void copiar()}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-[13px] font-bold text-white transition-colors hover:bg-white/20"
      >
        {copiado ? <Check className="h-4 w-4 text-[#7ee2a8]" /> : <Copy className="h-4 w-4" />}
        {copiado ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
