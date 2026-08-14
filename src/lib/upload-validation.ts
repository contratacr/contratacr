// Server-side upload validation. Client `accept=` can be bypassed, so EVERY upload
// route validates the REAL file type from its magic bytes (signature) — never the
// (spoofable) filename/extension/MIME — plus a size cap.
//
// SVG is intentionally NOT a recognized kind: it's text/XML with no binary
// signature, so `sniffFileType` returns null for it and it's rejected everywhere.
// The same goes for HTML, scripts and executables — none match a safe signature.

export type FileKind = "jpeg" | "png" | "webp" | "avif" | "gif" | "heic" | "heif" | "pdf";

// Safe RASTER image formats (no SVG). HEIC is the iPhone default; Cloudinary
// converts it. GIF is a safe raster.
export const IMAGE_KINDS: FileKind[] = ["jpeg", "png", "webp", "avif", "gif", "heic", "heif"];
export const DOC_KINDS: FileKind[] = ["pdf"];

// Real MIME for a detected kind — used to build a correct Cloudinary data URI
// (we don't trust the uploaded file.type).
export const MIME_FOR: Record<FileKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

// `accept` strings for the file pickers (kept in sync with the kinds above; NO
// `image/*`, which would let SVG through).
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/gif";
export const IMAGE_DOC_ACCEPT = `${IMAGE_ACCEPT},application/pdf`;

/**
 * Detect the file type from its leading bytes. Returns null for anything not on the
 * safe list (SVG, HTML, scripts, executables, …) so callers reject by whitelist.
 */
export function sniffFileType(buf: Uint8Array): FileKind | null {
  if (buf.length < 12) return null;
  const at = (i: number, s: string) => s.split("").every((ch, k) => buf[i + k] === ch.charCodeAt(0));
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  // GIF: "GIF8"
  if (at(0, "GIF8")) return "gif";
  // WEBP: "RIFF"????"WEBP"
  if (at(0, "RIFF") && at(8, "WEBP")) return "webp";
  // PDF: "%PDF-"
  if (at(0, "%PDF-")) return "pdf";
  // HEIC/HEIF: ....ftyp<brand> (ISO-BMFF box at offset 4)
  if (at(4, "ftyp")) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(brand)) {
      return "heic";
    }
    if (["heif", "mif1", "msf1"].includes(brand)) return "heif";
    if (["avif", "avis"].includes(brand)) return "avif";
  }
  return null;
}

export type ValidateResult = { ok: true; kind: FileKind } | { ok: false; error: string };

/**
 * Validate a file buffer against an allow-list of kinds + a size cap. The error
 * message is friendly and tells the user which formats are accepted.
 */
export function validateUpload(
  buf: Uint8Array,
  opts: { allow: FileKind[]; maxBytes: number; allowLabel: string }
): ValidateResult {
  if (buf.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (buf.length > opts.maxBytes) {
    return { ok: false, error: `El archivo supera el límite de ${Math.round(opts.maxBytes / (1024 * 1024))} MB.` };
  }
  const kind = sniffFileType(buf);
  if (!kind || !opts.allow.includes(kind)) {
    return { ok: false, error: `Formato no permitido. Usa ${opts.allowLabel}.` };
  }
  return { ok: true, kind };
}
