"use client";

import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import Image, { type ImageProps } from "next/image";
import { cldPreview } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

// One way to show a picture everywhere in the product: something sensible is on
// screen from the first paint, and the real file fades in instead of popping.
//
// - Cloudinary and Unsplash sources get a ~1 KB blurred derivative painted
//   underneath (the same picture, soft). Anything else gets a quiet neutral tone.
// - LO QUE PUSO EL SERVIDOR NO SE TOCA. Una imagen que venía en el HTML la
//   pinta el navegador por su cuenta en cuanto llega; esconderla al hidratar
//   solo podía empeorar las cosas: o no hacía nada, o apagaba una foto que ya
//   se estaba viendo para volver a encenderla 260 ms después —visible, se va,
//   vuelve: dos parpadeos—. Pasa al recargar con la red de verdad, cuando la
//   hidratación cae a mitad de la descarga.
// - El fundido queda para las imágenes que nacen DESPUÉS, ya con la app viva
//   (una lista que llega, una ventana que se abre): ahí no hay nada pintado
//   antes, así que aparecen una sola vez, suaves.
// - Sizing is the caller's: pass the already-transformed URL (cldThumb/cldLarge)
//   and the usual className; `fit` decides cover vs contain.
// Falso en el servidor y durante la hidratación (los efectos aún no corrieron),
// así que el primer render del cliente coincide con el HTML. Verdadero después.
let appYaHidratada = false;
type Fase = "ssr" | "waiting" | "loaded";
const faseInicial = (): Fase => (appYaHidratada ? "waiting" : "ssr");

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onLoad" | "onError"> & {
  src: string;
  alt: string;
  /** cover: the preview fills the box and the photo lands exactly on it.
   *  contain: letterboxed images (logos, offer covers on white) — no blurred
   *  preview, only a soft neutral tone and the fade. */
  fit?: "cover" | "contain";
  /** Above-the-fold pictures: eager + high priority instead of lazy. */
  priority?: boolean;
  /** Paint the blurred preview underneath (Cloudinary sources only). */
  preview?: boolean;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
};

export function ProgressiveImage({
  src,
  alt,
  fit = "cover",
  priority = false,
  preview = fit === "cover",
  className,
  wrapperClassName,
  wrapperStyle,
  onLoad,
  onError,
  style,
  ...rest
}: Props) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [phase, setPhase] = useState<Fase>(faseInicial);
  const previewUrl = preview ? cldPreview(src) ?? unsplashPreview(src) : null;

  useEffect(() => {
    appYaHidratada = true;
    const img = ref.current;
    if (!img) return;
    // Solo las que nacieron con la app ya viva esperan escondidas. Una que vino
    // del servidor se queda como está: visible, a cargo del navegador.
    setPhase((fase) => (fase === "ssr" ? "ssr" : img.complete && img.naturalWidth > 0 ? "loaded" : "waiting"));
  }, [src]);

  return (
    <span
      className={cn("relative block overflow-hidden", !previewUrl && "bg-[#eef2f6]", wrapperClassName)}
      style={{
        ...(previewUrl ? { backgroundImage: `url("${previewUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : null),
        ...wrapperStyle,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onLoad={(event) => { setPhase((fase) => (fase === "ssr" ? "ssr" : "loaded")); onLoad?.(event); }}
        onError={(event) => { setPhase((fase) => (fase === "ssr" ? "ssr" : "loaded")); onError?.(event); }}
        className={cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain", className)}
        style={{
          opacity: phase === "waiting" ? 0 : 1,
          transition: phase === "ssr" ? undefined : "opacity 260ms ease-out",
          ...style,
        }}
        {...rest}
      />
    </span>
  );
}

/** Unsplash serves its own blurred tiny derivative through imgix params. */
function unsplashPreview(src: string): string | null {
  if (!src.startsWith("https://images.unsplash.com/")) return null;
  const url = new URL(src);
  url.searchParams.set("w", "24");
  url.searchParams.set("q", "30");
  url.searchParams.set("blur", "200");
  url.searchParams.set("auto", "format");
  return url.toString();
}

/** next/image with `fill`, revealed the same way: a soft preview of the same
 *  picture underneath (Cloudinary or Unsplash), and a fade once the file lands. */
export function RevealImage({ src, className, style, onLoad, ...rest }: ImageProps) {
  const [phase, setPhase] = useState<Fase>(faseInicial);
  const ref = useRef<HTMLImageElement | null>(null);
  const url = typeof src === "string" ? src : null;
  const previewUrl = url ? cldPreview(url) ?? unsplashPreview(url) : null;
  useEffect(() => {
    appYaHidratada = true;
    const img = ref.current;
    if (!img) return;
    setPhase((fase) => (fase === "ssr" ? "ssr" : img.complete && img.naturalWidth > 0 ? "loaded" : "waiting"));
  }, [url]);
  return (
    <>
      <span
        aria-hidden
        className={cn("absolute inset-0", !previewUrl && "bg-[#dfe6ee]")}
        style={previewUrl ? { backgroundImage: `url("${previewUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      />
      <Image
        ref={ref}
        src={src}
        className={className}
        style={{
          opacity: phase === "waiting" ? 0 : 1,
          transition: phase === "ssr" ? undefined : "opacity 300ms ease-out",
          ...style,
        }}
        onLoad={(event) => { setPhase((fase) => (fase === "ssr" ? "ssr" : "loaded")); onLoad?.(event); }}
        {...rest}
      />
    </>
  );
}
