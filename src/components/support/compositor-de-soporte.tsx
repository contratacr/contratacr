"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { useLocale } from "next-intl";
import { IMAGE_DOC_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload } from "@/lib/client-image-upload";
import { MAX_ADJUNTOS_SOPORTE, type AdjuntoDeSoporte } from "@/lib/support/adjuntos";

const MAX_BYTES = 4 * 1024 * 1024;

type Elegido = { id: string; file: File; vista?: string };

function tamano(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function esImagen(a: Pick<AdjuntoDeSoporte, "type" | "name">) {
  return a.type.startsWith("image/") || /\.(jpe?g|png|webp|avif|gif|heic|heif)$/i.test(a.name);
}

/**
 * LA BARRA DE ESCRIBIR DE SOPORTE, igual a la de Mensajes: clip, campo con
 * borde y botón de enviar. Los archivos se suben al enviar (a
 * /api/support/adjuntos) y el mensaje los lleva por su ruta. La usan la
 * persona en su panel y el equipo en el panel admin.
 */
export function CompositorDeSoporte({
  ticketId,
  placeholder,
  className = "",
  onEnviar,
}: {
  ticketId: string;
  placeholder: string;
  className?: string;
  /** Devuelve false si el envío falló: el texto y los archivos vuelven al campo. */
  onEnviar: (texto: string, adjuntos: AdjuntoDeSoporte[]) => Promise<boolean>;
}) {
  const en = useLocale() === "en";
  const [texto, setTexto] = useState("");
  const [elegidos, setElegidos] = useState<Elegido[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState("");
  const archivoRef = useRef<HTMLInputElement | null>(null);
  const campoRef = useRef<HTMLTextAreaElement | null>(null);
  const elegidosRef = useRef(elegidos);
  useEffect(() => { elegidosRef.current = elegidos; }, [elegidos]);
  useEffect(() => () => elegidosRef.current.forEach((e) => e.vista && URL.revokeObjectURL(e.vista)), []);

  function ajustarAlto(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
    el.style.overflowY = el.scrollHeight > 144 ? "auto" : "hidden";
  }

  async function agregar(files: FileList | null) {
    setError("");
    if (!files?.length) return;
    setPreparando(true);
    const siguientes = [...elegidos];
    try {
      for (const file of Array.from(files)) {
        if (siguientes.length >= MAX_ADJUNTOS_SOPORTE) {
          setError(en ? "You can attach up to 3 files per message." : "Puedes adjuntar hasta 3 archivos por mensaje.");
          break;
        }
        const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        try {
          const listo = pdf ? file : await prepareImageForUpload(file, { maxDimension: 1600, targetBytes: 3.8 * 1024 * 1024 });
          if (listo.size > MAX_BYTES) {
            setError(en ? "Each file must be 4 MB or less." : "Cada archivo debe pesar 4 MB o menos.");
            continue;
          }
          siguientes.push({ id: `${Date.now()}-${crypto.randomUUID()}`, file: listo, vista: pdf ? undefined : URL.createObjectURL(listo) });
        } catch (fallo) {
          setError(getImageUploadPreparationErrorCode(fallo) === "too_large"
            ? (en ? "That image is too large. Choose a lighter image." : "La imagen es muy pesada. Elige una más liviana.")
            : (en ? "Attach JPG, PNG, WEBP, HEIC, GIF or PDF files only." : "Adjunta solo archivos JPG, PNG, WEBP, HEIC, GIF o PDF."));
        }
      }
      setElegidos(siguientes);
    } finally {
      setPreparando(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  }

  function quitar(id: string) {
    setElegidos((actuales) => {
      const fuera = actuales.find((e) => e.id === id);
      if (fuera?.vista) URL.revokeObjectURL(fuera.vista);
      return actuales.filter((e) => e.id !== id);
    });
  }

  async function enviar() {
    const limpio = texto.trim();
    if (enviando || preparando || (!limpio && !elegidos.length)) return;
    setEnviando(true);
    setError("");
    const subidos: AdjuntoDeSoporte[] = [];
    for (const elegido of elegidos) {
      const datos = new FormData();
      datos.append("file", elegido.file);
      datos.append("ticketId", ticketId);
      const res = await fetch("/api/support/adjuntos", { method: "POST", body: datos }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok || !json.attachment) {
        setError(json.error || (en ? "Could not upload the file." : "No se pudo subir el archivo."));
        setEnviando(false);
        return;
      }
      subidos.push(json.attachment);
    }
    const guardados = elegidos;
    setTexto("");
    setElegidos([]);
    requestAnimationFrame(() => ajustarAlto(campoRef.current));
    const ok = await onEnviar(limpio, subidos);
    setEnviando(false);
    if (ok) guardados.forEach((e) => e.vista && URL.revokeObjectURL(e.vista));
    else { setTexto(limpio); setElegidos(guardados); }
  }

  const puedeEnviar = !enviando && !preparando && (!!texto.trim() || elegidos.length > 0);

  return (
    <div className={`ccr-support-thread-composer shrink-0 border-t border-[#e5e7eb] bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:p-4 ${className}`}>
      {elegidos.length > 0 && (
        <div className="ccr-carril mb-2 flex gap-2 overflow-x-auto pb-1">
          {elegidos.map((e) => (
            <div key={e.id} className="relative flex h-16 min-w-40 max-w-48 items-center gap-2 rounded-xl border border-[#d8e5ee] bg-[#f7fbfd] p-2 pr-8">
              {e.vista
                // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
                ? <img src={e.vista} alt={e.file.name} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#e8f8ff] text-[#009FD9]"><FileText className="h-5 w-5" /></span>}
              <span className="min-w-0">
                <span className="block truncate text-xs font-extrabold text-[#162543]">{e.file.name}</span>
                <span className="block text-[10px] font-semibold text-[#6b7a90]">{tamano(e.file.size)}</span>
              </span>
              <button type="button" onClick={() => quitar(e.id)} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-[#526277] shadow-sm hover:text-red-600" aria-label={en ? "Remove attachment" : "Quitar adjunto"}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mb-2 text-xs font-semibold text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <input ref={archivoRef} type="file" multiple accept={IMAGE_DOC_ACCEPT} className="hidden" onChange={(e) => void agregar(e.target.files)} />
        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={enviando || preparando || elegidos.length >= MAX_ADJUNTOS_SOPORTE}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d8e5ee] bg-[#f7fbfd] text-[#526277] transition after:absolute after:-inset-1 after:content-[''] hover:border-[#9fd8ec] hover:text-[#009FD9] disabled:opacity-45"
          aria-label={en ? "Attach file" : "Adjuntar archivo"}
        >
          {preparando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </button>
        <textarea
          ref={(el) => { campoRef.current = el; ajustarAlto(el); }}
          rows={1}
          value={texto}
          onChange={(e) => { setTexto(e.target.value.slice(0, 4000)); ajustarAlto(e.currentTarget); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); }
          }}
          placeholder={placeholder}
          className="max-h-36 min-h-12 min-w-0 flex-1 resize-none overflow-hidden rounded-[20px] border border-[#d8e5ee] px-4 py-2.5 text-[15px] leading-6 outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/10"
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={!puedeEnviar}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#009FD9] text-white transition after:absolute after:-inset-1 after:content-[''] hover:bg-[#008fca] disabled:bg-[#d8e4e9]"
          aria-label={en ? "Send" : "Enviar"}
        >
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

/** Los adjuntos dentro del globo: fotos en miniatura y PDF como ficha. */
export function AdjuntosDelMensaje({ adjuntos, propio }: { adjuntos?: AdjuntoDeSoporte[] | null; propio: boolean }) {
  if (!adjuntos?.length) return null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5">
      {adjuntos.map((a) => (
        esImagen(a) && a.url ? (
          <a key={a.path} href={a.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de un bucket privado */}
            <img src={a.url} alt={a.name} className="h-40 w-40 max-w-full object-cover" />
          </a>
        ) : (
          <a key={a.path} href={a.url ?? undefined} target="_blank" rel="noopener noreferrer" className={`flex max-w-full items-center gap-2 rounded-xl px-3 py-2 ${propio ? "bg-white/15 text-white" : "bg-white text-[#162543]"}`}>
            <FileText className="h-5 w-5 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold">{a.name}</span>
              <span className={`block text-[11px] ${propio ? "text-white/70" : "text-[#6b7a90]"}`}>{tamano(a.size)}</span>
            </span>
          </a>
        )
      ))}
    </div>
  );
}
