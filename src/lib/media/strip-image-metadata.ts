/**
 * Lossless image-metadata stripper for user uploads (profile avatars, portfolio photos).
 *
 * Pure TypeScript on Uint8Array: no Node-only or native imports (sharp must never be loaded in the Worker
 * runtime, see docs/security-review.md). The pixels are never decoded or re-encoded; only container-level
 * metadata blocks are removed, everything else is copied byte-for-byte.
 *
 * Policy (allow-list, fail closed): only blocks needed to render the image are kept; anything unknown is
 * dropped (ancillary) or the file is refused (critical/structural).
 *  - JPEG: keep SOF/DHT/DQT/DRI/SOS/entropy data, APP0 (JFIF/JFXX), APP2 ICC_PROFILE, APP14 Adobe. Drop APP1
 *    (Exif, XMP, extended XMP), APP2 MPF (multi-picture: secondary images carry their own EXIF/GPS), APP3–APP13
 *    (APP13 = IPTC/Photoshop), APP15, COM and every byte after EOI (camera trailers, appended images).
 *  - PNG: keep critical chunks and the rendering ancillaries (iCCP, gAMA, cHRM, sRGB, sBIT, cICP, mDCv, cLLi,
 *    bKGD, hIST, tRNS, pHYs, sPLT, acTL, fcTL, fdAT). Drop eXIf, tEXt, zTXt, iTXt, tIME and any other chunk
 *    (e.g. C2PA caBX). Unknown critical chunks → refused. Bytes after IEND are dropped.
 *  - WebP: keep VP8X, VP8, VP8L, ALPH, ICCP, ANIM, ANMF; drop EXIF, XMP and unknown chunks; clear the VP8X
 *    EXIF/XMP flags; rewrite the RIFF size. Bytes after the RIFF payload are dropped.
 *  - GIF: keep image data, graphic-control extensions and the NETSCAPE2.0/ANIMEXTS1.0 loop extension; drop
 *    comment, plain-text and every other application extension (XMP, ICC, vendor). Bytes after the trailer
 *    are dropped.
 *  - AVIF/HEIC/HEIF (ISO-BMFF): refused. Stripping EXIF/XMP items from an ISO-BMFF file means rewriting the
 *    iinf/iloc/iref/ipma boxes and their offsets; a mistake there either corrupts the photo or silently leaves
 *    the GPS in place, so this module does not attempt it.
 *
 * Orientation: removing EXIF would also remove the Orientation tag, and the photo would then display rotated
 * or mirrored (browsers apply EXIF orientation by default). The orientation is read first and, when it is not
 * 1 (normal), a MINIMAL EXIF block is written back that holds ONLY that tag (26-byte TIFF: one IFD0 entry,
 * no next IFD, no GPS/Exif sub-IFDs). The image therefore renders exactly as it did before stripping, while no
 * personal data survives. Re-encoding to bake the rotation in would need a codec (not available losslessly in
 * the Worker) and rejecting would refuse most phone photos.
 */

export type StripFormat = "jpeg" | "png" | "webp" | "gif";
/** What was removed, for logging/tests. Never contains the metadata itself. */
export type RemovedKind = "exif" | "gps" | "xmp" | "iptc" | "comment" | "text" | "time" | "mpf" | "app" | "chunk" | "extension" | "trailer";
export type StripFailure = "unsupported_format" | "iso_bmff" | "malformed" | "metadata_remains";
export type StripResult =
  | { ok: true; format: StripFormat; bytes: Uint8Array; orientation: number | null; removed: RemovedKind[] }
  | { ok: false; reason: StripFailure };

// ── Byte helpers ─────────────────────────────────────────────────────────────────────────────────────────
const at = (b: Uint8Array, i: number, s: string) =>
  i >= 0 && b.length >= i + s.length && [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const u32le = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)) + b[i + 3]! * 0x1000000;
const bytes = (...v: number[]) => Uint8Array.from(v);
const str = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const be32 = (v: number) => bytes((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
const le32 = (v: number) => bytes(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

class Malformed extends Error {}
const need = (cond: boolean) => { if (!cond) throw new Malformed("malformed"); };

// ── Format detection ─────────────────────────────────────────────────────────────────────────────────────
export function detectStripFormat(b: Uint8Array): StripFormat | "iso_bmff" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  if (at(b, 0, "RIFF") && at(b, 8, "WEBP")) return "webp";
  if (at(b, 0, "GIF87a") || at(b, 0, "GIF89a")) return "gif";
  if (at(b, 4, "ftyp")) return "iso_bmff";
  return null;
}

// ── EXIF orientation ─────────────────────────────────────────────────────────────────────────────────────
/** Orientation (1–8) from a TIFF block (starting at "II"/"MM"), or null when absent/invalid. */
export function readTiffOrientation(b: Uint8Array, start: number, end: number): number | null {
  if (end > b.length || end - start < 8) return null;
  const le = b[start] === 0x49 && b[start + 1] === 0x49;
  if (!le && !(b[start] === 0x4d && b[start + 1] === 0x4d)) return null;
  const r16 = (i: number) => (le ? u16le(b, i) : u16be(b, i));
  const r32 = (i: number) => (le ? u32le(b, i) : u32be(b, i));
  if (r16(start + 2) !== 42) return null;
  const ifd = start + r32(start + 4);
  if (ifd + 2 > end) return null;
  const n = r16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > end) return null;
    if (r16(e) === 0x0112) {
      if (r16(e + 2) !== 3 || r32(e + 4) !== 1) return null;
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** Big-endian TIFF with a single IFD0 entry: Orientation (0x0112, SHORT, count 1). 26 bytes. */
export function orientationTiff(orientation: number): Uint8Array {
  if (!Number.isInteger(orientation) || orientation < 2 || orientation > 8) throw new RangeError("orientation");
  return bytes(
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 at offset 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation SHORT ×1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  );
}
const isOrientationTiff = (b: Uint8Array) => {
  if (b.length !== 26) return false;
  const o = b[19]!;
  return o >= 2 && o <= 8 && sameBytes(b, orientationTiff(o));
};

// ── CRC32 (PNG) ──────────────────────────────────────────────────────────────────────────────────────────
let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── JPEG ─────────────────────────────────────────────────────────────────────────────────────────────────
type Walk = { bytes: Uint8Array; orientation: number | null; removed: Set<RemovedKind> };

function exifKinds(b: Uint8Array, tiffStart: number, end: number, removed: Set<RemovedKind>) {
  removed.add("exif");
  if (hasTag(b, tiffStart, end, 0x8825)) removed.add("gps");
}
function hasTag(b: Uint8Array, start: number, end: number, tag: number) {
  if (end > b.length || end - start < 8) return false;
  const le = b[start] === 0x49 && b[start + 1] === 0x49;
  if (!le && !(b[start] === 0x4d && b[start + 1] === 0x4d)) return false;
  const r16 = (i: number) => (le ? u16le(b, i) : u16be(b, i));
  const ifd = start + (le ? u32le(b, start + 4) : u32be(b, start + 4));
  if (ifd + 2 > end) return false;
  for (let k = 0, n = r16(ifd); k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > end) return false;
    if (r16(e) === tag) return true;
  }
  return false;
}

function stripJpeg(b: Uint8Array): Walk {
  const removed = new Set<RemovedKind>();
  const out: Uint8Array[] = [bytes(0xff, 0xd8)];
  let orientation: number | null = null;
  let insertAt = 1; // index in `out` where the minimal EXIF goes (after SOI, or after a leading APP0)
  let i = 2;
  let ended = false;
  while (i < b.length) {
    need(b[i] === 0xff);
    while (b[i + 1] === 0xff) i++; // fill bytes
    need(i + 1 < b.length);
    const m = b[i + 1]!;
    if (m === 0xd9) { out.push(bytes(0xff, 0xd9)); i += 2; ended = true; break; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { out.push(bytes(0xff, m)); i += 2; continue; }
    need(m !== 0xd8 && m !== 0x00);
    need(i + 4 <= b.length);
    const len = u16be(b, i + 2);
    need(len >= 2 && i + 2 + len <= b.length);
    const body = i + 4, end = i + 2 + len, seg = b.subarray(i, end);
    let keep = true;
    if (m === 0xe0) {
      if (out.length === 1) insertAt = 2;
    } else if (m === 0xe1) {
      keep = false;
      if (at(b, body, "Exif\0")) {
        const tiff = body + 6;
        if (isOrientationTiff(b.subarray(tiff, end))) {
          orientation = b[tiff + 19]!; // our own minimal block: not personal metadata
        } else {
          exifKinds(b, tiff, end, removed);
          orientation ??= readTiffOrientation(b, tiff, end);
        }
      } else if (at(b, body, "http://ns.adobe.com/")) removed.add("xmp");
      else removed.add("app");
    } else if (m === 0xe2) {
      if (!at(b, body, "ICC_PROFILE\0")) { keep = false; removed.add(at(b, body, "MPF\0") ? "mpf" : "app"); }
    } else if (m === 0xee) {
      if (!at(b, body, "Adobe")) { keep = false; removed.add("app"); }
    } else if (m === 0xed) { keep = false; removed.add("iptc"); }
    else if (m >= 0xe3 && m <= 0xef) { keep = false; removed.add("app"); }
    else if (m === 0xfe) { keep = false; removed.add("comment"); }
    if (keep) out.push(seg);
    i = end;
    if (m === 0xda) {
      // Entropy-coded data: runs until a marker that is not a stuffed 0x00 or a restart marker.
      let j = i;
      while (j < b.length) {
        if (b[j] === 0xff && j + 1 < b.length) {
          const nb = b[j + 1]!;
          if (nb === 0x00 || (nb >= 0xd0 && nb <= 0xd7)) { j += 2; continue; }
          break;
        }
        j++;
      }
      out.push(b.subarray(i, j));
      i = j;
    }
  }
  // A truncated file that simply ends inside scan data is tolerated (everything kept is pixel data);
  // anything after EOI is dropped.
  if (ended && i < b.length) removed.add("trailer");
  if (orientation !== null && orientation !== 1) {
    const tiff = orientationTiff(orientation);
    const app1 = concat([bytes(0xff, 0xe1, ((tiff.length + 8) >> 8) & 0xff, (tiff.length + 8) & 0xff), str("Exif\0\0"), tiff]);
    out.splice(insertAt, 0, app1);
  }
  return { bytes: concat(out), orientation, removed };
}

// ── PNG ──────────────────────────────────────────────────────────────────────────────────────────────────
const PNG_SAFE_ANCILLARY = new Set(["iCCP", "gAMA", "cHRM", "sRGB", "sBIT", "cICP", "mDCv", "cLLi", "bKGD", "hIST", "tRNS", "pHYs", "sPLT", "acTL", "fcTL", "fdAT"]);
const PNG_CRITICAL = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);

function pngChunk(type: string, data: Uint8Array) {
  const td = concat([str(type), data]);
  return concat([be32(data.length), td, be32(crc32(td))]);
}

function stripPng(b: Uint8Array): Walk {
  const removed = new Set<RemovedKind>();
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let orientation: number | null = null;
  let firstIdat = -1;
  let i = 8, sawIhdr = false, sawEnd = false;
  while (i < b.length) {
    need(i + 12 <= b.length);
    const len = u32be(b, i), type = ascii(b, i + 4, 4);
    need(/^[A-Za-z]{4}$/.test(type) && len <= 0x7fffffff && i + 12 + len <= b.length);
    need(sawIhdr || type === "IHDR");
    sawIhdr = true;
    const data = b.subarray(i + 8, i + 8 + len), chunk = b.subarray(i, i + 12 + len);
    if (PNG_CRITICAL.has(type) || PNG_SAFE_ANCILLARY.has(type)) {
      if (type === "IDAT" && firstIdat < 0) firstIdat = out.length;
      out.push(chunk);
    } else if (type === "eXIf") {
      if (isOrientationTiff(data)) orientation = data[19]!;
      else {
        exifKinds(b, i + 8, i + 8 + len, removed);
        orientation ??= readTiffOrientation(b, i + 8, i + 8 + len);
      }
    } else if (type === "iTXt") removed.add(at(b, i + 8, "XML:com.adobe.xmp") ? "xmp" : "text");
    else if (type === "tEXt" || type === "zTXt") removed.add("text");
    else if (type === "tIME") removed.add("time");
    else {
      need((type.charCodeAt(0) & 0x20) !== 0); // unknown CRITICAL chunk: cannot render without it → refuse
      removed.add("chunk");
    }
    i += 12 + len;
    if (type === "IEND") { sawEnd = true; break; }
  }
  need(sawEnd && firstIdat > 0);
  if (i < b.length) removed.add("trailer");
  if (orientation !== null && orientation !== 1) out.splice(firstIdat, 0, pngChunk("eXIf", orientationTiff(orientation)));
  return { bytes: concat(out), orientation, removed };
}

// ── WebP ─────────────────────────────────────────────────────────────────────────────────────────────────
const WEBP_KEEP = new Set(["VP8X", "VP8 ", "VP8L", "ALPH", "ICCP", "ANIM", "ANMF"]);
const VP8X_EXIF = 0x08, VP8X_XMP = 0x04;

function stripWebp(b: Uint8Array): Walk {
  const removed = new Set<RemovedKind>();
  need(b.length >= 20);
  const riffEnd = 8 + u32le(b, 4);
  need(riffEnd <= b.length && riffEnd >= 20);
  const out: Uint8Array[] = [];
  let orientation: number | null = null;
  let vp8x: Uint8Array | null = null;
  let i = 12, sawImage = false;
  while (i < riffEnd) {
    need(i + 8 <= riffEnd);
    const type = ascii(b, i, 4), len = u32le(b, i + 4);
    const padded = len + (len & 1);
    need(i + 8 + len <= riffEnd);
    const chunk = b.subarray(i, Math.min(riffEnd, i + 8 + padded));
    if (type === "VP8X") {
      need(i === 12 && len >= 10);
      vp8x = chunk.slice(); // copy: its flags are rewritten below
      out.push(vp8x);
    } else if (WEBP_KEEP.has(type)) {
      if (type === "VP8 " || type === "VP8L" || type === "ANMF") sawImage = true;
      out.push(chunk);
    } else if (type === "EXIF") {
      const s = at(b, i + 8, "Exif\0\0") ? i + 14 : i + 8;
      const data = b.subarray(s, i + 8 + len);
      if (isOrientationTiff(data)) orientation = data[19]!;
      else {
        exifKinds(b, s, i + 8 + len, removed);
        orientation ??= readTiffOrientation(b, s, i + 8 + len);
      }
    } else if (type === "XMP ") removed.add("xmp");
    else removed.add("chunk");
    i += 8 + padded;
  }
  need(sawImage);
  if (riffEnd < b.length) removed.add("trailer");
  if (vp8x) {
    vp8x[8] = vp8x[8]! & ~(VP8X_EXIF | VP8X_XMP);
    if (orientation !== null && orientation !== 1) {
      const tiff = orientationTiff(orientation); // 26 bytes, even → no padding byte
      out.push(concat([str("EXIF"), le32(tiff.length), tiff]));
      vp8x[8] = vp8x[8]! | VP8X_EXIF;
    }
  }
  // A simple (non-VP8X) WebP has no valid place for EXIF; any stray EXIF chunk is dropped and decoders never
  // applied it, so the rendering does not change. The orientation is still returned to the caller.
  const body = concat(out);
  return { bytes: concat([str("RIFF"), le32(body.length + 4), str("WEBP"), body]), orientation, removed };
}

// ── GIF ──────────────────────────────────────────────────────────────────────────────────────────────────
function gifSubBlocksEnd(b: Uint8Array, i: number) {
  for (;;) {
    need(i < b.length);
    const n = b[i]!;
    i += 1 + n;
    if (n === 0) return i;
  }
}

function stripGif(b: Uint8Array): Walk {
  const removed = new Set<RemovedKind>();
  need(b.length >= 13);
  const flags = b[10]!;
  let i = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  need(i <= b.length);
  const out: Uint8Array[] = [b.subarray(0, i)];
  let sawImage = false, ended = false;
  while (i < b.length) {
    const t = b[i]!;
    if (t === 0x3b) { out.push(bytes(0x3b)); i++; ended = true; break; }
    if (t === 0x2c) {
      need(i + 10 <= b.length);
      const lf = b[i + 9]!;
      let j = i + 10 + (lf & 0x80 ? 3 * (1 << ((lf & 7) + 1)) : 0);
      need(j + 1 <= b.length);
      j = gifSubBlocksEnd(b, j + 1); // LZW minimum code size, then data sub-blocks
      out.push(b.subarray(i, j));
      sawImage = true;
      i = j;
      continue;
    }
    need(t === 0x21 && i + 2 <= b.length);
    const label = b[i + 1]!;
    const end = gifSubBlocksEnd(b, i + 2);
    if (label === 0xf9) out.push(b.subarray(i, end));
    else if (label === 0xff) {
      const id = b[i + 2] === 11 ? ascii(b, i + 3, 11) : "";
      if (id === "NETSCAPE2.0" || id === "ANIMEXTS1.0") out.push(b.subarray(i, end));
      else removed.add(id === "XMP DataXMP" ? "xmp" : "extension");
    } else if (label === 0xfe) removed.add("comment");
    else if (label === 0x01) removed.add("text");
    else removed.add("extension");
    i = end;
  }
  need(sawImage);
  if (!ended) out.push(bytes(0x3b)); // close a truncated GIF cleanly
  if (ended && i < b.length) removed.add("trailer");
  return { bytes: concat(out), orientation: null, removed };
}

// ── Public API ───────────────────────────────────────────────────────────────────────────────────────────
const WALKERS: Record<StripFormat, (b: Uint8Array) => Walk> = { jpeg: stripJpeg, png: stripPng, webp: stripWebp, gif: stripGif };

/**
 * Removes EXIF (incl. GPS), XMP, IPTC, comments/text and trailing data from a JPEG/PNG/WebP/GIF without
 * touching the pixels. Self-verifying: the output is walked again and must need no further stripping
 * (idempotent), otherwise the result is `metadata_remains`.
 */
export function stripImageMetadata(input: Uint8Array): StripResult {
  const format = detectStripFormat(input);
  if (format === "iso_bmff") return { ok: false, reason: "iso_bmff" };
  if (!format) return { ok: false, reason: "unsupported_format" };
  try {
    const first = WALKERS[format](input);
    const second = WALKERS[format](first.bytes);
    const norm = (o: number | null) => (o !== null && o !== 1 ? o : null);
    if (second.removed.size > 0 || !sameBytes(second.bytes, first.bytes) || norm(second.orientation) !== norm(first.orientation)) {
      return { ok: false, reason: "metadata_remains" };
    }
    return { ok: true, format, bytes: first.bytes, orientation: first.orientation, removed: [...first.removed] };
  } catch (error) {
    if (error instanceof Malformed) return { ok: false, reason: "malformed" };
    throw error;
  }
}

/**
 * Second, independent gate. `scan` is an external metadata scanner (the route passes `scanMetadata` from
 * src/lib/directory/photo-pipeline.ts). The ONLY finding tolerated is "exif" when this module wrote the
 * orientation-only block, and that block is re-checked byte-for-byte. Returns true when clean.
 */
export function verifyStripped(result: Extract<StripResult, { ok: true }>, scan: (b: Uint8Array) => string[]): boolean {
  const found = scan(result.bytes);
  const wroteOrientation = result.orientation !== null && result.orientation !== 1 && result.format !== "gif";
  for (const kind of found) {
    if (kind === "exif" && wroteOrientation) continue;
    return false;
  }
  // Orientation-only EXIF must be exactly our 26-byte block (no GPS pointer, no other tags).
  const again = WALKERS[result.format](result.bytes);
  return again.removed.size === 0;
}

/** User-facing text per failure (ES/EN). */
export function stripFailureText(reason: StripFailure): { es: string; en: string } {
  switch (reason) {
    case "iso_bmff":
      return {
        es: "Las fotos AVIF/HEIC no se pueden guardar sin quitarles los datos ocultos (como la ubicación). Conviértala o compártala como JPG e inténtelo de nuevo.",
        en: "AVIF/HEIC photos cannot be saved without removing their hidden data (such as location). Convert or share it as JPG and try again.",
      };
    case "malformed":
      return {
        es: "No se pudo leer la imagen. Expórtala de nuevo como JPG o PNG e inténtelo otra vez.",
        en: "The image could not be read. Export it again as JPG or PNG and try again.",
      };
    case "metadata_remains":
      return {
        es: "No se pudo quitar la información oculta de la foto (como la ubicación). Pruebe con otra imagen o guárdela como JPG.",
        en: "The photo's hidden information (such as location) could not be removed. Try another image or save it as JPG.",
      };
    case "unsupported_format":
      return { es: "Formato no permitido. Use JPG, PNG, WEBP o GIF.", en: "Format not allowed. Use JPG, PNG, WEBP or GIF." };
  }
}
