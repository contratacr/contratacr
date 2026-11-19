// Run: node --test scripts/media/clean-image-upload.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { register } from "node:module";
// The helper uses extensionless TS imports (tsc style); teach node to resolve them to .ts.
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (/^\\.\\.?\\//.test(s)) return n(s + ".ts", c); throw e; } }`));
const { cleanImageUpload } = await import("../../src/lib/media/clean-image-upload.ts");

const EXIF = { IFD0: { Artist: "Client Name" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "9/1 56/1 1234/100", GPSLongitudeRef: "W", GPSLongitude: "84/1 5/1 678/100" } };
const base = () => sharp({ create: { width: 32, height: 32, channels: 3, background: "#468" } });
const has = (b, s) => Buffer.from(b).includes(Buffer.from(s, "latin1"));

test("JPEG/PNG/WebP: metadata removed, pixels intact", async () => {
  for (const [kind, enc] of [["jpeg", (i) => i.withExif(EXIF).jpeg()], ["png", (i) => i.withExif(EXIF).png()], ["webp", (i) => i.withExif(EXIF).webp()]]) {
    const input = await enc(base()).toBuffer();
    assert.ok(has(input, "Client Name"), `${kind} fixture should carry metadata`);
    const r = cleanImageUpload(kind, input);
    assert.equal(r.ok, true, kind);
    assert.equal(r.stripped, true);
    assert.equal(has(r.bytes, "Client Name"), false, kind);
    assert.equal(has(r.bytes, "GPSLatitude"), false, kind);
    const [a, b] = await Promise.all([sharp(input).raw().toBuffer(), sharp(r.bytes).raw().toBuffer()]);
    assert.ok(a.equals(b), `${kind} pixels changed`);
  }
});

test("PDF passes through untouched", () => {
  const pdf = Buffer.from("%PDF-1.4\n/Author (Someone)\n%%EOF");
  const r = cleanImageUpload("pdf", pdf);
  assert.equal(r.ok, true);
  assert.equal(r.stripped, false);
  assert.equal(r.bytes, pdf);
});

test("AVIF/HEIC refused; malformed image refused (fail closed)", () => {
  const bmff = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(12)]);
  for (const k of ["heic", "avif", "heif"]) {
    const r = cleanImageUpload(k, bmff);
    assert.equal(r.ok, false);
  }
  const bad = cleanImageUpload("jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00]));
  assert.equal(bad.ok, false);
  assert.ok(bad.text.es && bad.text.en);
});
