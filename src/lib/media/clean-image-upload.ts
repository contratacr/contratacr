import { stripFailureText, stripImageMetadata, verifyStripped } from "./strip-image-metadata";
import { scanMetadata } from "../directory/photo-pipeline";
import { IMAGE_KINDS, type FileKind } from "../upload-validation";

export type CleanUploadResult =
  | { ok: true; bytes: Buffer; stripped: boolean }
  | { ok: false; text: { es: string; en: string }; code: "formato" | "metadatos" };

/**
 * Privacy gate for user uploads that are NOT public photos (chat, support, verification, contact).
 * Image kinds (JPEG/PNG/WebP/GIF) are stripped losslessly of EXIF/GPS/XMP/IPTC/comments/trailers and
 * re-checked by the independent scanner (fail closed). AVIF/HEIC/HEIF are refused (cannot be stripped
 * safely). Non-image kinds (PDF) pass through untouched.
 */
export function cleanImageUpload(kind: FileKind, input: Buffer): CleanUploadResult {
  if (!IMAGE_KINDS.includes(kind)) return { ok: true, bytes: input, stripped: false };
  const stripped = stripImageMetadata(input);
  if (!stripped.ok) {
    return { ok: false, text: stripFailureText(stripped.reason), code: stripped.reason === "iso_bmff" ? "formato" : "metadatos" };
  }
  if (!verifyStripped(stripped, scanMetadata)) {
    return { ok: false, text: stripFailureText("metadata_remains"), code: "metadatos" };
  }
  return { ok: true, bytes: Buffer.from(stripped.bytes.buffer, stripped.bytes.byteOffset, stripped.bytes.byteLength), stripped: true };
}
