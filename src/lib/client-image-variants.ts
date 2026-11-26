"use client";

/**
 * Browser-side resizing before upload (storage plan 2026-11-26, docs/storage-plan.md). The server re-validates every
 * file (magic bytes, size, metadata, proportions); this only saves bandwidth, storage and server work.
 *  - decode with the EXIF orientation applied (createImageBitmap imageOrientation:'from-image'),
 *  - draw into a canvas (OffscreenCanvas when available) that fits a box, stepping down from the previous size,
 *  - encode WebP (quality 0.82). A browser that cannot encode WebP (canvas silently returns PNG, e.g. Safari) gets
 *    JPEG where a smaller file is required (thumbnails, place variants) or null (the caller keeps its old path).
 * Canvas output carries no EXIF/GPS.
 */
export const PHOTO_WEBP_QUALITY = 0.82;
export const PHOTO_JPEG_QUALITY = 0.85;
export const PUBLIC_PHOTO_MAX_SIDE = 1600;
export const THUMB_SIDE = 400;

type Surface = OffscreenCanvas | HTMLCanvasElement;
type Bitmap = { source: CanvasImageSource; width: number; height: number; close: () => void };

/** Same arithmetic as fitInside() in photo-pipeline.ts, so the server's ±1 px check holds. */
export function fitBox(width: number, height: number, box: number) {
  const s = Math.min(1, box / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

async function decode(file: Blob): Promise<Bitmap | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    return null;
  }
}

function surface(width: number, height: number): Surface | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function draw(source: CanvasImageSource, width: number, height: number, opaque: boolean): Surface | null {
  const canvas = surface(width, height);
  const ctx = canvas?.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined;
  if (!canvas || !ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (opaque) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function encode(canvas: Surface, type: "image/webp" | "image/jpeg", quality: number): Promise<Blob | null> {
  try {
    const blob = "convertToBlob" in canvas
      ? await canvas.convertToBlob({ type, quality })
      : await new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality));
    // An unsupported type silently comes back as PNG: only the requested type counts.
    return blob && blob.type === type ? blob : null;
  } catch {
    return null;
  }
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, "").trim() || "foto";
const asFile = (blob: Blob, name: string) =>
  new File([blob], `${baseName(name)}.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type, lastModified: Date.now() });
const isAnimatedCandidate = (file: Blob) => file.type === "image/gif";

/**
 * Public photo (portfolio / success stories) as WebP fitting 1600 px. null when the browser cannot decode or encode
 * WebP: the caller then uses prepareImageForUpload (JPEG) as before.
 */
export async function preparePublicWebp(file: File, maxSide = PUBLIC_PHOTO_MAX_SIDE): Promise<File | null> {
  if (isAnimatedCandidate(file)) return null;
  const bitmap = await decode(file);
  if (!bitmap) return null;
  try {
    const size = fitBox(bitmap.width, bitmap.height, maxSide);
    const canvas = draw(bitmap.source, size.width, size.height, false);
    const blob = canvas && await encode(canvas, "image/webp", PHOTO_WEBP_QUALITY);
    return blob ? asFile(blob, file.name) : null;
  } finally {
    bitmap.close();
  }
}

/** 400 px thumbnail of an (already prepared) photo: WebP, else JPEG; null when the browser cannot do it. */
export async function makeThumbnail(file: Blob, name = "foto"): Promise<File | null> {
  if (isAnimatedCandidate(file)) return null;
  const bitmap = await decode(file);
  if (!bitmap) return null;
  try {
    const size = fitBox(bitmap.width, bitmap.height, THUMB_SIDE);
    const canvas = draw(bitmap.source, size.width, size.height, false);
    if (!canvas) return null;
    const webp = await encode(canvas, "image/webp", PHOTO_WEBP_QUALITY);
    if (webp) return asFile(webp, `${baseName(name)}-sm`);
    const opaque = draw(bitmap.source, size.width, size.height, true);
    const jpeg = opaque && await encode(opaque, "image/jpeg", PHOTO_JPEG_QUALITY);
    return jpeg ? asFile(jpeg, `${baseName(name)}-sm`) : null;
  } finally {
    bitmap.close();
  }
}

export type PlaceVariants = { v1600: File; v800: File; v320: File };

/**
 * The three directory variants (1600/800/320) made in the browser, all WebP or (no WebP encoder) all JPEG. The server
 * accepts them as-is after validation, so no server-side image transformation is needed. null → send the file alone.
 */
export async function makePlaceVariants(file: File): Promise<PlaceVariants | null> {
  if (isAnimatedCandidate(file)) return null;
  const bitmap = await decode(file);
  if (!bitmap) return null;
  try {
    const main = fitBox(bitmap.width, bitmap.height, 1600);
    const mid = fitBox(main.width, main.height, 800), small = fitBox(main.width, main.height, 320);
    for (const type of ["image/webp", "image/jpeg"] as const) {
      const opaque = type === "image/jpeg", quality = opaque ? PHOTO_JPEG_QUALITY : PHOTO_WEBP_QUALITY;
      const c1600 = draw(bitmap.source, main.width, main.height, opaque);
      const c800 = c1600 && draw(c1600 as CanvasImageSource, mid.width, mid.height, opaque);
      const c320 = c800 && draw(c800 as CanvasImageSource, small.width, small.height, opaque);
      if (!c1600 || !c800 || !c320) return null;
      const [b1600, b800, b320] = await Promise.all([encode(c1600, type, quality), encode(c800, type, quality), encode(c320, type, quality)]);
      if (b1600 && b800 && b320) return { v1600: asFile(b1600, file.name), v800: asFile(b800, `${baseName(file.name)}-800`), v320: asFile(b320, `${baseName(file.name)}-320`) };
    }
    return null;
  } finally {
    bitmap.close();
  }
}
