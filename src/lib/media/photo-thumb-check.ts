import { readHeader, scanMetadata, sniffPhoto } from "../directory/photo-pipeline";

/**
 * Server check of the browser-made thumbnail that /api/upload/photo stores next to the large photo (storage plan
 * 2026-11-26). Pure and runtime-neutral (node --test). The server never trusts the client: the thumbnail must be a
 * still WebP/JPEG of at most 400 px (+ rounding), with the large photo's proportions (either orientation, because a
 * light original keeps its EXIF orientation while the thumbnail is drawn upright) and no metadata. The route also runs
 * the same magic-byte validation, malware scan and metadata stripping on it as on the large file.
 * Known limit: the content itself is not compared, so a client could pair two different pictures.
 */
export const THUMB_MAX_SIDE = 400;
export const THUMB_MAX_BYTES = 512 * 1024;

export type ThumbCheck =
  | { ok: true; ext: "webp" | "jpg"; contentType: "image/webp" | "image/jpeg" }
  | { ok: false; reason: "format" | "too_large" | "size" | "aspect" | "metadata" | "main_unreadable" };

export function checkThumbForMain(main: Uint8Array, thumb: Uint8Array): ThumbCheck {
  if (thumb.length === 0 || thumb.length > THUMB_MAX_BYTES) return { ok: false, reason: "too_large" };
  const kind = sniffPhoto(thumb);
  if (kind !== "image/webp" && kind !== "image/jpeg") return { ok: false, reason: "format" };
  const t = readHeader(thumb);
  if (!t || t.animated) return { ok: false, reason: "format" };
  const m = readHeader(main);
  if (!m || m.animated) return { ok: false, reason: "main_unreadable" };
  const long = Math.max(t.width, t.height);
  if (long > THUMB_MAX_SIDE + 1 || Math.min(t.width, t.height) < 1) return { ok: false, reason: "size" };
  // A thumbnail is never larger than its photo.
  if (long > Math.max(m.width, m.height) + 1) return { ok: false, reason: "size" };
  const ratio = (w: number, h: number) => w / h;
  const close = (a: number, b: number) => Math.abs(a - b) / b <= 0.03 + 2 / long;
  if (!close(ratio(t.width, t.height), ratio(m.width, m.height)) && !close(ratio(t.width, t.height), ratio(m.height, m.width))) {
    return { ok: false, reason: "aspect" };
  }
  if (scanMetadata(thumb).length) return { ok: false, reason: "metadata" };
  return kind === "image/webp" ? { ok: true, ext: "webp", contentType: kind } : { ok: true, ext: "jpg", contentType: kind };
}
