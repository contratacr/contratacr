"use client";

import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { useLocale } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { prepareImageForUpload } from "@/lib/client-image-upload";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";

// Coordinates are relative to the square viewport, independent of device size.
export function avatarGeometry(width: number, height: number, zoom: number, x: number, y: number) {
  const scale = Math.max(1 / width, 1 / height) * zoom;
  const w = width * scale, h = height * scale;
  return { w, h, x: Math.max(-w / 2, Math.min(w / 2, x)), y: Math.max(-h / 2, Math.min(h / 2, y)) };
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> & { onFile: (file: File) => void };

export const AvatarFileInput = forwardRef<HTMLInputElement, Props>(function AvatarFileInput({ onFile, ...props }, ref) {
  const en = useLocale() === "en";
  const [selection, setSelection] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!selection) return;
    let active = true;
    let url = "";
    // Normalise camera orientation/HEIC and bound decoded memory before editing.
    prepareImageForUpload(selection, { maxDimension: 1600, targetBytes: 1024 * 1024 }).then(file => {
      if (!active) return;
      url = URL.createObjectURL(file);
      setSource(url);
    }).catch(() => { if (active) setError(en ? "This photo could not be opened. Choose JPG, PNG or WebP." : "No se pudo abrir la foto. Elige JPG, PNG o WebP."); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [selection, en]);
  function close() { if (!busy) { setSelection(null); setSource(""); setError(""); } }
  async function apply() {
    if (!image.current || !size.width) return;
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      const g = avatarGeometry(size.width, size.height, zoom, position.x, position.y);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 800, 800);
      ctx.drawImage(image.current, (0.5 - g.w / 2 + g.x) * 800, (0.5 - g.h / 2 + g.y) * 800, g.w * 800, g.h * 800);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("canvas")), "image/jpeg", 0.9));
      const file = new File([blob], "perfil.jpg", { type: "image/jpeg" });
      onFile(file);
      setSelection(null); setSource("");
    } catch { setError(en ? "Could not adjust the photo. Try again." : "No se pudo ajustar la foto. Inténtalo de nuevo."); }
    finally { setBusy(false); }
  }
  const g = size.width ? avatarGeometry(size.width, size.height, zoom, position.x, position.y) : null;
  return <>
    <input {...props} ref={ref} type="file" accept={props.accept ?? IMAGE_ACCEPT} onChange={event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
      if (file) { setSource(""); setError(""); setSize({ width: 0, height: 0 }); setZoom(1); setPosition({ x: 0, y: 0 }); setSelection(file); }
    }} />
    {selection && <Modal title={en ? "Adjust photo" : "Ajustar foto"} closeLabel={en ? "Close" : "Cerrar"} onClose={close} size="sm" mobilePresentation="center" footer={<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={busy}>{en ? "Cancel" : "Cancelar"}</Button><Button type="button" onClick={() => void apply()} disabled={!g || busy} loading={busy}>{en ? "Use photo" : "Usar foto"}</Button></div>}>
      <p className="mb-4 text-sm text-[#68778d]">{en ? "Drag to centre your photo or logo." : "Arrastra para centrar tu foto o logo."}</p>
      <div role="img" aria-label={en ? "Circular photo preview" : "Vista previa circular"} className="relative mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-full bg-white ring-1 ring-[#d7e1ea]" style={{ touchAction: "none", cursor: "grab" }}
        onPointerDown={e => { if (!g || busy) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; }}
        onPointerMove={e => { const d = drag.current; if (!d || d.id !== e.pointerId || !g) return; const width = e.currentTarget.getBoundingClientRect().width; const dx = (e.clientX - d.x) / width, dy = (e.clientY - d.y) / width; drag.current = { id: d.id, x: e.clientX, y: e.clientY }; setPosition(p => { const next = avatarGeometry(size.width, size.height, zoom, p.x + dx, p.y + dy); return { x: next.x, y: next.y }; }); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {source && <img ref={image} src={source} alt="" draggable={false} onLoad={e => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError={() => setError(en ? "Choose another photo." : "Elige otra foto.")} style={g ? { position: "absolute", maxWidth: "none", width: `${g.w * 100}%`, height: `${g.h * 100}%`, left: `${(0.5 - g.w / 2 + g.x) * 100}%`, top: `${(0.5 - g.h / 2 + g.y) * 100}%` } : { visibility: "hidden" }} />}
      </div>
      <label className="mt-5 block text-sm font-medium">Zoom<input aria-label="Zoom" type="range" min={size.width ? Math.min(0.25, Math.min(size.width, size.height) / Math.hypot(size.width, size.height)) : 0.25} max="3" step="0.01" value={zoom} disabled={!g || busy} className="mt-2 block min-h-11 w-full accent-[#009FD9]" onChange={e => setZoom(Number(e.target.value))} /></label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={!g || busy} onClick={() => { setZoom(Math.min(size.width, size.height) / Math.hypot(size.width, size.height)); setPosition({ x: 0, y: 0 }); }}>{en ? "Fit logo" : "Mostrar logo completo"}</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}>{en ? "Centre" : "Centrar"}</Button></div>
      <div className="mt-2 flex justify-center gap-2" aria-label={en ? "Move photo" : "Mover foto"}>{[["←",-.05,0],["↑",0,-.05],["↓",0,.05],["→",.05,0]].map(([label,x,y]) => <button type="button" key={label} disabled={!g || busy} aria-label={`${en ? "Move" : "Mover"} ${label}`} className="h-11 w-11 rounded-full border border-[#d7e1ea]" onClick={() => setPosition(p => { const next = avatarGeometry(size.width, size.height, zoom, p.x + Number(x), p.y + Number(y)); return { x: next.x, y: next.y }; })}>{label}</button>)}</div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>}
  </>;
});
