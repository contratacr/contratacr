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
    <div className="rounded-2xl bg-gradient-to-br from-[#162543] to-[#1d3b63] px-4 py-3.5 text-left">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8fb8d8]">{label}</p>
      {/* El enlace entero, sin cortar: es lo que se quiere enseñar. */}
      <p className="mt-1.5 text-[15px] font-extrabold leading-snug text-white [overflow-wrap:anywhere]">{visible}</p>
      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={() => void copiar()}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:bg-[#f6f9fb]"
        >
          {copiado ? <Check className="h-4 w-4 text-[#15803d]" /> : <Copy className="h-4 w-4" />}
          {copiado ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}
