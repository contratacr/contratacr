// Run: node --test scripts/media/strip-image-metadata.test.mjs
// Fixtures are generated in memory with sharp (no downloaded images). sharp is used ONLY by this test, to
// build fixtures and to prove the stripped files still decode to the same pixels; the stripper itself is
// pure TypeScript and runs in the Worker (see src/lib/media/strip-image-metadata.ts).
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
const S = await import("../../src/lib/media/strip-image-metadata.ts");
const { scanMetadata } = await import("../../src/lib/directory/photo-pipeline.ts");

const GPS_EXIF = {
  IFD0: { Copyright: "Fixture", Artist: "Client Name", Make: "FixtureCam" },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "9/1 56/1 1234/100", GPSLongitudeRef: "W", GPSLongitude: "84/1 5/1 678/100" },
};
const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="9,56.2N" exif:GPSLongitude="84,5.1W"/></rdf:RDF></x:xmpmeta>';

function raw(width, height) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    data[i] = (x * 255) / width; data[i + 1] = (y * 255) / height; data[i + 2] = (x * y) % 251;
  }
  return sharp(data, { raw: { width, height, channels: 3 } });
}
const withMeta = (img, orientation) => {
  img = img.withExif(GPS_EXIF).withXmp(XMP);
  return orientation ? img.withMetadata({ orientation }) : img;
};
const latin = (s) => Buffer.from(s, "latin1");
const has = (buf, s) => Buffer.from(buf).includes(latin(s));
/** Leaks that must never survive: GPS EXIF, XMP GPS, the artist name, comments, text. */
const LEAKS = ["Client Name", "FixtureCam", "GPSLatitude", "adobe:ns:meta", "SECRET-COMMENT", "SECRET-TEXT", "SECRET-IPTC", "SECRET-TRAILER"];
const assertNoLeaks = (buf) => { for (const s of LEAKS) assert.equal(has(buf, s), false, `leak: ${s}`); };
const pixels = async (buf) => (await sharp(Buffer.from(buf)).raw().toBuffer({ resolveWithObject: true }));
async function assertSamePixels(a, b) {
  const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
  assert.equal(pa.info.width, pb.info.width); assert.equal(pa.info.height, pb.info.height);
  assert.ok(pa.data.equals(pb.data), "pixels changed");
}
const strip = (buf) => { const r = S.stripImageMetadata(new Uint8Array(buf)); assert.equal(r.ok, true, JSON.stringify(r)); return r; };

// ── JPEG helpers: insert segments after SOI and junk after EOI ────────────────────────────────────────────
const seg = (marker, body) => Buffer.concat([Buffer.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
const insertAfterSoi = (jpg, ...segs) => Buffer.concat([jpg.subarray(0, 2), ...segs, jpg.subarray(2)]);

test("JPEG: GPS EXIF, XMP, IPTC, COM, MPF and trailer are removed; pixels identical; orientation kept as a minimal tag", async () => {
  const base = await withMeta(raw(64, 48), 6).jpeg({ quality: 90 }).toBuffer();
  assert.ok(scanMetadata(new Uint8Array(base)).includes("gps"), "fixture must carry GPS");
  const dirty = Buffer.concat([
    insertAfterSoi(base,
      seg(0xfe, latin("SECRET-COMMENT")),
      seg(0xed, latin("Photoshop 3.0\0SECRET-IPTC")),
      seg(0xe2, latin("MPF\0MM\0*SECRET")),
    ),
    latin("SECRET-TRAILER"),
  ]);
  const r = strip(dirty);
  assert.equal(r.format, "jpeg");
  assert.equal(r.orientation, 6);
  for (const k of ["exif", "gps", "xmp", "iptc", "comment", "mpf", "trailer"]) assert.ok(r.removed.includes(k), `removed ${k}`);
  assertNoLeaks(r.bytes);
  assert.deepEqual(scanMetadata(r.bytes), ["exif"]); // only the orientation-only block
  assert.equal(S.verifyStripped(r, scanMetadata), true);
  const meta = await sharp(Buffer.from(r.bytes)).metadata();
  assert.equal(meta.orientation, 6, "display orientation preserved");
  assert.ok(meta.exif.length < 40, "EXIF is the minimal block");
  await assertSamePixels(base, r.bytes);
  // Displayed (auto-oriented) size matches the original's.
  const [a, b] = await Promise.all([sharp(base).rotate().toBuffer({ resolveWithObject: true }), sharp(Buffer.from(r.bytes)).rotate().toBuffer({ resolveWithObject: true })]);
  assert.deepEqual([a.info.width, a.info.height], [b.info.width, b.info.height]);
});

test("JPEG: no orientation → no EXIF at all; ICC profile and JFIF kept", async () => {
  const base = await raw(40, 30).withExif(GPS_EXIF).withXmp(XMP).withIccProfile("srgb").jpeg().toBuffer();
  const r = strip(base);
  assert.equal(r.orientation === null || r.orientation === 1, true);
  assert.deepEqual(scanMetadata(r.bytes), []);
  assert.ok(has(r.bytes, "ICC_PROFILE"), "ICC kept");
  assert.ok((await sharp(Buffer.from(r.bytes)).metadata()).icc, "ICC still readable");
  assertNoLeaks(r.bytes);
  await assertSamePixels(base, r.bytes);
});

test("JPEG: metadata hidden after the first scan (progressive) is also removed", async () => {
  const base = await withMeta(raw(48, 48)).jpeg({ progressive: true }).toBuffer();
  // Put an APP1 GPS EXIF copy right before EOI (after the scans) — scanMetadata alone stops at SOS.
  const exifSeg = (() => { let i = 2; while (i < base.length) { const m = base[i + 1], len = base.readUInt16BE(i + 2); if (m === 0xe1 && base.includes(latin("Exif"), i)) return base.subarray(i, i + 2 + len); i += 2 + len; } })();
  const dirty = Buffer.concat([base.subarray(0, base.length - 2), exifSeg, seg(0xfe, latin("SECRET-COMMENT")), Buffer.from([0xff, 0xd9])]);
  const r = strip(dirty);
  assertNoLeaks(r.bytes);
  await assertSamePixels(base, r.bytes);
});

// ── PNG ───────────────────────────────────────────────────────────────────────────────────────────────────
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const pngChunk = (type, data) => { const td = Buffer.concat([latin(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const tiffGps = async () => { // the TIFF block of a real GPS EXIF (from a sharp JPEG)
  const j = await withMeta(raw(8, 8), 3).jpeg().toBuffer();
  const i = j.indexOf(latin("Exif\0\0"));
  return j.subarray(i + 6, i - 2 + j.readUInt16BE(i - 2));
};

test("PNG: eXIf, tEXt, zTXt, iTXt (XMP), tIME removed; gAMA/iCCP kept; orientation kept as minimal eXIf", async () => {
  const base = await raw(32, 24).withIccProfile("srgb").png().toBuffer();
  const tiff = await tiffGps();
  const ihdrEnd = 8 + 25;
  const dirty = Buffer.concat([
    base.subarray(0, ihdrEnd),
    pngChunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])),
    pngChunk("eXIf", tiff),
    pngChunk("tEXt", latin("Comment\0SECRET-TEXT")),
    pngChunk("zTXt", latin("Author\0\0SECRET-TEXT")),
    pngChunk("iTXt", Buffer.concat([latin("XML:com.adobe.xmp\0\0\0\0\0"), latin(XMP)])),
    pngChunk("tIME", Buffer.from([0x07, 0xea, 11, 16, 10, 0, 0])),
    pngChunk("caBX", latin("SECRET-TEXT")),
    base.subarray(ihdrEnd),
    latin("SECRET-TRAILER"),
  ]);
  assert.ok(scanMetadata(new Uint8Array(dirty)).includes("gps"));
  const r = strip(dirty);
  assert.equal(r.orientation, 3);
  for (const k of ["exif", "gps", "xmp", "text", "time", "chunk", "trailer"]) assert.ok(r.removed.includes(k), `removed ${k}`);
  assertNoLeaks(r.bytes);
  assert.deepEqual(scanMetadata(r.bytes), ["exif"]);
  assert.equal(S.verifyStripped(r, scanMetadata), true);
  assert.ok(has(r.bytes, "gAMA") && has(r.bytes, "iCCP"), "rendering chunks kept");
  const meta = await sharp(Buffer.from(r.bytes)).metadata();
  assert.equal(meta.orientation, 3);
  await assertSamePixels(base, r.bytes);
});

test("PNG: sharp-written metadata is removed too", async () => {
  const base = await withMeta(raw(20, 20)).png().toBuffer();
  const r = strip(base);
  assertNoLeaks(r.bytes);
  assert.equal(S.verifyStripped(r, scanMetadata), true);
  await assertSamePixels(base, r.bytes);
});

// ── WebP ──────────────────────────────────────────────────────────────────────────────────────────────────
test("WebP: EXIF and XMP chunks removed, VP8X flags cleared, RIFF size fixed; orientation kept", async () => {
  for (const orientation of [undefined, 8]) {
    const base = await withMeta(raw(30, 20), orientation).webp({ lossless: true }).toBuffer();
    assert.ok(scanMetadata(new Uint8Array(base)).includes("xmp"), "fixture carries XMP");
    const dirty = Buffer.concat([base, latin("SECRET-TRAILER")]);
    const r = strip(dirty);
    const out = Buffer.from(r.bytes);
    assertNoLeaks(out);
    assert.equal(out.readUInt32LE(4), out.length - 8, "RIFF size");
    assert.equal(out[20] & 0x04, 0, "XMP flag cleared");
    if (orientation) {
      assert.equal(r.orientation, 8);
      assert.equal(out[20] & 0x08, 0x08, "EXIF flag only for the orientation block");
      assert.deepEqual(scanMetadata(r.bytes), ["exif"]);
      assert.equal((await sharp(out).metadata()).orientation, 8);
    } else {
      assert.equal(out[20] & 0x08, 0, "EXIF flag cleared");
      assert.deepEqual(scanMetadata(r.bytes), []);
    }
    assert.equal(S.verifyStripped(r, scanMetadata), true);
    await assertSamePixels(base, out);
  }
});

// ── GIF ───────────────────────────────────────────────────────────────────────────────────────────────────
const subBlocks = (data) => { const parts = []; for (let i = 0; i < data.length; i += 255) { const c = data.subarray(i, i + 255); parts.push(Buffer.from([c.length]), c); } parts.push(Buffer.from([0])); return Buffer.concat(parts); };
const appExt = (id, data) => Buffer.concat([Buffer.from([0x21, 0xff, 11]), latin(id), subBlocks(data)]);

test("GIF: comment, plain-text and application extensions removed, NETSCAPE loop kept", async () => {
  // Two-frame animated GIF (pageHeight splits the raw strip into frames) so sharp writes a NETSCAPE loop.
  const strip2 = Buffer.concat([Buffer.alloc(16 * 16 * 3, 0x30), Buffer.alloc(16 * 16 * 3, 0xc0)]);
  const gif = await sharp(strip2, { raw: { width: 16, height: 32, channels: 3 } }).gif({ loop: 0 }).toBuffer()
    .then((g) => sharp(g).toBuffer()).catch(() => null) ?? await raw(16, 16).gif().toBuffer();
  // Locate the end of header + global colour table, then inject the extensions there.
  const flags = gif[10];
  const hdr = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  const comment = Buffer.concat([Buffer.from([0x21, 0xfe]), subBlocks(latin("SECRET-COMMENT"))]);
  const plain = Buffer.concat([Buffer.from([0x21, 0x01, 12, 0, 0, 0, 0, 16, 0, 16, 0, 8, 8, 1, 0]), subBlocks(latin("SECRET-TEXT"))]);
  const xmp = appExt("XMP DataXMP", latin(XMP));
  const vendor = appExt("ACMECORP1.0", latin("SECRET-TEXT"));
  const hasNetscape = has(gif, "NETSCAPE2.0");
  const netscape = hasNetscape ? Buffer.alloc(0) : appExt("NETSCAPE2.0", Buffer.from([1, 0, 0]));
  const dirty = Buffer.concat([gif.subarray(0, hdr), netscape, comment, plain, xmp, vendor, gif.subarray(hdr), latin("SECRET-TRAILER")]);
  const r = strip(dirty);
  for (const k of ["comment", "text", "xmp", "extension", "trailer"]) assert.ok(r.removed.includes(k), `removed ${k}`);
  assertNoLeaks(r.bytes);
  assert.ok(has(r.bytes, "NETSCAPE2.0"), "loop extension kept");
  assert.equal(r.bytes.at(-1), 0x3b, "ends with trailer");
  assert.equal(S.verifyStripped(r, scanMetadata), true);
  await assertSamePixels(gif, r.bytes);
});

// ── Fail closed ───────────────────────────────────────────────────────────────────────────────────────────
test("AVIF/HEIC (ISO-BMFF) are refused with a clear message", async () => {
  const avif = await withMeta(raw(16, 16)).avif().toBuffer();
  const r = S.stripImageMetadata(new Uint8Array(avif));
  assert.deepEqual(r, { ok: false, reason: "iso_bmff" });
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), latin("ftypheic"), Buffer.alloc(12)]);
  assert.equal(S.stripImageMetadata(new Uint8Array(heic)).reason, "iso_bmff");
  const t = S.stripFailureText("iso_bmff");
  assert.match(t.es, /JPG/); assert.match(t.en, /JPG/);
});

test("malformed or unknown inputs are refused, never passed through", () => {
  const badJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00]); // segment length past the end
  assert.deepEqual(S.stripImageMetadata(badJpeg), { ok: false, reason: "malformed" });
  const pngNoIend = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1]);
  assert.equal(S.stripImageMetadata(pngNoIend).reason, "malformed");
  const webpNoImage = new Uint8Array([...latin("RIFF"), 4, 0, 0, 0, ...latin("WEBP")]);
  assert.equal(S.stripImageMetadata(webpNoImage).reason, "malformed");
  assert.equal(S.stripImageMetadata(new Uint8Array(latin("<svg/>"))).reason, "unsupported_format");
});

test("PNG with an unknown CRITICAL chunk is refused", async () => {
  const base = await raw(8, 8).png().toBuffer();
  const dirty = Buffer.concat([base.subarray(0, 33), pngChunk("ZZZZ", latin("SECRET-TEXT")), base.subarray(33)]);
  assert.equal(S.stripImageMetadata(new Uint8Array(dirty)).reason, "malformed");
});

test("verifyStripped fails closed when the independent scanner still sees metadata", async () => {
  const base = await raw(16, 16).jpeg().toBuffer();
  const r = strip(base);
  assert.equal(S.verifyStripped(r, () => []), true);
  assert.equal(S.verifyStripped(r, () => ["gps"]), false);
  assert.equal(S.verifyStripped(r, () => ["xmp"]), false);
  assert.equal(S.verifyStripped(r, () => ["exif"]), false, "EXIF tolerated only when an orientation block was written");
  const rot = strip(await raw(16, 16).withMetadata({ orientation: 6 }).jpeg().toBuffer());
  assert.equal(S.verifyStripped(rot, () => ["exif"]), true);
  assert.equal(S.verifyStripped(rot, () => ["exif", "gps"]), false);
});

test("stripping is idempotent and keeps already-clean files byte-identical", async () => {
  const clean = await raw(16, 16).jpeg().toBuffer();
  const r1 = strip(clean), r2 = strip(r1.bytes);
  assert.ok(Buffer.from(r2.bytes).equals(Buffer.from(r1.bytes)));
  assert.deepEqual(r2.removed, []);
});
