"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type OpcionDeServicio = { value: string; label: string };

/**
 * EL SERVICIO DEL CATÁLOGO, ELEGIDO DE UNA LISTA, NO ADIVINADO.
 *
 * Lo usa el formulario de empleos para decir a qué oficio pertenece la vacante.
 * De ahí sale a quién se le avisa: con el servicio elegido a mano el aviso es
 * exacto, mientras que deducirlo del título mandaría «Mecánico Diésel» a los
 * mecánicos industriales y «Estilista» a peluquería y estética por igual. Un
 * par de avisos equivocados y la gente apaga las notificaciones.
 *
 * Con más de seis opciones aparece un buscador: el catálogo tiene más de 160
 * servicios y recorrerlos a dedo no es una opción en un teléfono.
 */
export function SelectorDeServicio({
  opciones,
  valor,
  onChange,
  etiquetaVacia,
  buscarTexto,
  sinResultados,
  invalido = false,
  id = "selector-de-servicio",
}: {
  opciones: OpcionDeServicio[];
  valor: string;
  onChange: (valor: string) => void;
  etiquetaVacia: string;
  buscarTexto: string;
  sinResultados: string;
  invalido?: boolean;
  id?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [escrito, setEscrito] = useState("");
  const cerrarRef = useRef<number | null>(null);
  const elegida = opciones.find((opcion) => opcion.value === valor) ?? null;

  const visibles = useMemo(() => {
    const termino = escrito.trim().toLowerCase();
    if (!termino) return opciones;
    return opciones.filter((opcion) => opcion.label.toLowerCase().includes(termino));
  }, [escrito, opciones]);

  function elegir(opcion: OpcionDeServicio) {
    onChange(opcion.value);
    setEscrito("");
    setAbierto(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => { setEscrito(""); setAbierto((previo) => !previo); }}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 text-left text-sm font-medium outline-none transition-colors",
          invalido ? "border-red-300" : "border-[#d7e1ea]",
        )}
      >
        <span className={elegida ? "truncate text-[#162543]" : "truncate text-[#68778d]"}>
          {elegida?.label ?? etiquetaVacia}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#7b8ba1] transition-transform", abierto && "rotate-180")} aria-hidden="true" />
      </button>

      {abierto && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-[#d7e1ea] bg-white shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]">
          {opciones.length > 6 && (
            <div className="relative border-b border-[#e5e7eb] p-2">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b8ba1]" aria-hidden="true" />
              <input
                autoFocus
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                value={escrito}
                onChange={(evento) => setEscrito(evento.target.value)}
                // El cierre se demora un instante: sin eso, el toque en una
                // opción llega después de que la lista ya se cerró.
                onBlur={() => { cerrarRef.current = window.setTimeout(() => { setEscrito(""); setAbierto(false); }, 120); }}
                onFocus={() => { if (cerrarRef.current) window.clearTimeout(cerrarRef.current); }}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter" && visibles[0]) { evento.preventDefault(); elegir(visibles[0]); }
                  if (evento.key === "Escape") { setEscrito(""); setAbierto(false); }
                }}
                placeholder={buscarTexto}
                className="h-10 w-full rounded-lg bg-[#f4f7fa] pl-9 pr-3 text-sm text-[#162543] outline-none placeholder:text-[#8f9aaa]"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {visibles.length === 0 && <li className="px-3 py-3 text-sm text-[#68778d]">{sinResultados}</li>}
            {visibles.map((opcion) => (
              <li key={opcion.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={opcion.value === valor}
                  onMouseDown={(evento) => evento.preventDefault()}
                  onClick={() => elegir(opcion)}
                  className={cn(
                    "flex w-full items-center px-3 py-2.5 text-left text-sm font-medium",
                    opcion.value === valor ? "bg-[#eaf6fc] text-[#007fae]" : "text-[#162543] hover:bg-[#f4f7fa]",
                  )}
                >
                  {opcion.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
