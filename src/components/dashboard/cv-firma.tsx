"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Trash2 } from "lucide-react";
import { MAX_FIRMA, esFirmaValida } from "@/lib/cv/documento";

/**
 * LA FIRMA A MANO (20-nov-2026), como en FlowCV: se dibuja con el dedo o el
 * mouse y sale en la carta y en la declaración del CV. Se guarda como un PNG
 * chico con fondo transparente (3 de ancho por 1 de alto, menos de 60 KB).
 */

const ANCHO = 600;
const ALTO = 200;
const TINTA = "#162543";

/** El PNG del lienzo, achicado hasta que entre en el tope. */
function exportar(lienzo: HTMLCanvasElement): string | null {
  for (const escala of [1, 0.75, 0.5]) {
    const c = document.createElement("canvas");
    c.width = Math.round(ANCHO * escala);
    c.height = Math.round(ALTO * escala);
    c.getContext("2d")?.drawImage(lienzo, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/png");
    if (url.length <= MAX_FIRMA) return url;
  }
  return null;
}

export function FirmaDibujada({ valor, alCambiar, en }: { valor?: string; alCambiar: (firma: string | undefined) => void; en: boolean }) {
  const [dibujando, setDibujando] = useState(false);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const trazo = useRef<{ x: number; y: number } | null>(null);
  const [tocado, setTocado] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!dibujando) return;
    const c = lienzo.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, ANCHO, ALTO);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = TINTA;
  }, [dibujando]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ANCHO, y: ((e.clientY - r.top) / r.height) * ALTO };
  };
  const bajar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    trazo.current = punto(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) { ctx.beginPath(); ctx.arc(trazo.current.x, trazo.current.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = TINTA; ctx.fill(); }
    setTocado(true);
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!trazo.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = punto(e);
    if (ctx) { ctx.beginPath(); ctx.moveTo(trazo.current.x, trazo.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    trazo.current = p;
  };
  const soltar = () => { trazo.current = null; };

  const limpiar = () => { lienzo.current?.getContext("2d")?.clearRect(0, 0, ANCHO, ALTO); setTocado(false); setError(false); };
  const guardar = () => {
    if (!lienzo.current || !tocado) return;
    const url = exportar(lienzo.current);
    if (!url || !esFirmaValida(url)) { setError(true); return; }
    alCambiar(url);
    setDibujando(false);
    setTocado(false);
  };

  const boton = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition-colors disabled:opacity-50";

  if (!dibujando) {
    return (
      <div className="grid gap-2" data-testid="cv-firma">
        <p className="text-sm font-semibold text-[#344054]">{en ? "Handwritten signature (optional)" : "Firma a mano (opcional)"}</p>
        {esFirmaValida(valor) ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL dibujada aquí, no hay nada que optimizar */}
            <img src={valor} alt={en ? "Your signature" : "Su firma"} className="h-12 w-36 rounded-lg border border-[#e4e7ec] bg-white object-contain" />
            <button type="button" onClick={() => setDibujando(true)} className={`${boton} border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f5f8fb]`}><PenLine className="h-4 w-4" />{en ? "Redo" : "Volver a firmar"}</button>
            <button type="button" onClick={() => alCambiar(undefined)} className={`${boton} text-[#b42318] hover:bg-[#fef3f2]`}><Trash2 className="h-4 w-4" />{en ? "Remove" : "Quitar"}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setDibujando(true)} className={`${boton} w-fit border border-dashed border-[#b9c7d6] bg-white text-[#162543] hover:bg-[#f5f8fb]`}><PenLine className="h-4 w-4" />{en ? "Draw my signature" : "Dibujar mi firma"}</button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2" data-testid="cv-firma">
      <p className="text-sm font-semibold text-[#344054]">{en ? "Sign with your finger or mouse" : "Firme con el dedo o el mouse"}</p>
      <div className="relative w-full max-w-md rounded-xl bg-white">
      <span aria-hidden className="pointer-events-none absolute inset-x-6 bottom-[26%] border-b border-dashed border-[#c9d4e0]" />
      <canvas
        ref={lienzo}
        width={ANCHO}
        height={ALTO}
        aria-label={en ? "Signature pad" : "Espacio para firmar"}
        role="img"
        onPointerDown={bajar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onPointerLeave={soltar}
        className="relative aspect-[3/1] w-full cursor-crosshair touch-none rounded-xl border border-[#d7e1ea] bg-transparent"
      />
      </div>
      {error && <p role="alert" className="text-[13px] font-semibold text-[#b42318]">{en ? "That signature is too detailed. Try a simpler one." : "Esa firma tiene demasiado detalle. Pruebe una más simple."}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!tocado} onClick={guardar} className={`${boton} bg-[#009FD9] text-white hover:bg-[#0089bb]`}>{en ? "Use this signature" : "Usar esta firma"}</button>
        <button type="button" onClick={limpiar} className={`${boton} border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f5f8fb]`}><Eraser className="h-4 w-4" />{en ? "Clear" : "Borrar"}</button>
        <button type="button" onClick={() => { limpiar(); setDibujando(false); }} className={`${boton} text-[#475467] hover:bg-[#f2f4f7]`}>{en ? "Cancel" : "Cancelar"}</button>
      </div>
    </div>
  );
}
