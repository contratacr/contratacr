// Run: node --test scripts/storage/photo-storage.test.mjs
// Storage plan 2026-11-26 (docs/storage-plan.md): R2 pair URLs (r2Thumb/r2Large), the server check of the
// browser-made thumbnail and the client-variants codec of the directory pipeline. Fixtures are made with sharp in
// memory; nothing remote is touched.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import sharp from "sharp";
const sourceRoot = new URL("../../src/lib/", import.meta.url).href;
registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.startsWith(sourceRoot) && specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier) ? specifier + ".ts" : specifier, context); } });
const U = await import("../../src/lib/r2-image-url.ts");
const T = await import("../../src/lib/media/photo-thumb-check.ts");
const P = await import("../../src/lib/directory/photo-pipeline.ts");

const img = (w, h) => {
  const data = Buffer.alloc(w * h * 3);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37) % 251;
  return sharp(data, { raw: { width: w, height: h, channels: 3 } });
};

test("pairedKeys + r2Thumb: only marked R2 URLs are rewritten, idempotently", () => {
  const k = U.pairedKeys("contratacr/portfolio/u/1-abc", "webp", "webp");
  assert.deepEqual(k, { main: "contratacr/portfolio/u/1-abc.lg.webp", thumb: "contratacr/portfolio/u/1-abc.sm.webp" });
  const j = U.pairedKeys("contratacr/profiles/u/1-abc", "jpg", "jpg");
  assert.equal(j.main, "contratacr/profiles/u/1-abc.lg-j.jpg");
  const big = "https://assets.contratacr.com/" + k.main;
  assert.equal(U.r2Thumb(big, 160), "https://assets.contratacr.com/" + k.thumb);
  assert.equal(U.r2Thumb(U.r2Thumb(big, 160), 160), "https://assets.contratacr.com/" + k.thumb);
  assert.equal(U.r2Thumb("https://assets.contratacr.com/" + j.main, 400), "https://assets.contratacr.com/" + j.thumb);
  assert.equal(U.r2Thumb(big, 900), big, "large sizes keep the large file");
  assert.equal(U.r2Thumb(big + "?v=2", 100), "https://assets.contratacr.com/" + k.thumb + "?v=2");
  const legacy = "https://assets.contratacr.com/contratacr/profiles/u/1700-x.jpg";
  assert.equal(U.r2Thumb(legacy, 100), legacy, "no thumbnail stored → unchanged");
  assert.equal(U.r2ThumbUrl(legacy), null);
  const cld = "https://res.cloudinary.com/demo/image/upload/v1/contratacr/a.jpg";
  assert.equal(U.r2Thumb(cld, 120), "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,w_120,h_120/v1/contratacr/a.jpg");
  assert.equal(U.r2Large(cld, 1280), "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1280/v1/contratacr/a.jpg");
  assert.equal(U.r2Large(big, 1280), big);
  assert.equal(U.r2Thumb("", 100), "");
});

test("checkThumbForMain: WebP/JPEG ≤400 px with the photo's proportions and no metadata", async () => {
  const main = new Uint8Array(await img(1600, 1200).webp().toBuffer());
  const good = new Uint8Array(await img(400, 300).webp().toBuffer());
  assert.deepEqual(T.checkThumbForMain(main, good), { ok: true, ext: "webp", contentType: "image/webp" });
  const rotated = new Uint8Array(await img(300, 400).jpeg().toBuffer());
  assert.equal(T.checkThumbForMain(main, rotated).ok, true, "EXIF-oriented original vs upright thumbnail");
  assert.equal(T.checkThumbForMain(main, new Uint8Array(await img(800, 600).webp().toBuffer())).reason, "size");
  assert.equal(T.checkThumbForMain(main, new Uint8Array(await img(400, 100).webp().toBuffer())).reason, "aspect");
  assert.equal(T.checkThumbForMain(main, new Uint8Array(await img(400, 300).png().toBuffer())).reason, "format");
  const exif = new Uint8Array(await img(400, 300).withExif({ IFD0: { Artist: "x" } }).jpeg().toBuffer());
  assert.equal(T.checkThumbForMain(main, exif).reason, "metadata");
  const small = new Uint8Array(await img(200, 150).webp().toBuffer());
  assert.equal(T.checkThumbForMain(small, good).reason, "size", "never larger than the photo");
  assert.equal(T.checkThumbForMain(new TextEncoder().encode("GIF89a...."), good).reason, "main_unreadable");
});

test("client variants codec: accepted as-is when they fit, refused when they do not", async () => {
  const id = await P.derivedUuid("t", "1");
  const v = async (w, h) => new Uint8Array(await img(w, h).webp({ quality: 82 }).toBuffer());
  const variants = { 1600: await v(1600, 1067), 800: await v(800, 534), 320: await v(320, 213) };
  const ok = await P.processListingPhoto(variants[1600], { photoId: id, codec: P.createClientVariantsCodec(variants) });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.photo.codec, "client");
  assert.equal(ok.photo.variants[320].bytes, variants[320], "bytes stored as sent");
  const wrong = await P.processListingPhoto(variants[1600], { photoId: id, codec: P.createClientVariantsCodec({ ...variants, 800: await v(800, 800) }) });
  assert.deepEqual(wrong, { ok: false, reason: "codec" });
  const meta = new Uint8Array(await img(320, 213).withExif({ IFD0: { Artist: "x" } }).jpeg().toBuffer());
  const tagged = await P.processListingPhoto(variants[1600], { photoId: id, codec: P.createClientVariantsCodec({ ...variants, 320: meta }) });
  assert.deepEqual(tagged, { ok: false, reason: "metadata" });
  const form = new FormData();
  assert.equal(await P.clientVariantsOf(form, variants[1600]), null);
  form.set("v800", new Blob([variants[800]])); form.set("v320", new Blob([variants[320]]));
  assert.deepEqual(Object.keys(await P.clientVariantsOf(form, variants[1600])).sort(), ["1600", "320", "800"]);
  assert.match(P.photoRejectText("browser_prep", "es"), /Su navegador/);
});
