// Run: node --test scripts/directory/place-photos.test.mjs
// Validation of place photo uploads (launch round 2026-11-18): browser pick check, captions, alt text, URL helpers,
// schemas, and the server pipeline on an EXIF/GPS JPEG (stripped), a PNG (accepted), HEIC/GIF (refused) and dedupe hash.
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
const L = await import("../../src/lib/directory/place-photos.ts");
const P = await import("../../src/lib/directory/photo-pipeline.ts");
const { createSharpPhotoCodec } = await import("../../src/lib/directory/photo-codec-sharp.ts");
const codec = await createSharpPhotoCodec();
const ID = "22222222-2222-4222-8222-222222222222";

test("browser pick check: type and size", () => {
  assert.deepEqual(L.checkPhotoPick({ type: "image/jpeg", size: 1000, name: "a.jpg" }), { ok: true });
  assert.deepEqual(L.checkPhotoPick({ type: "image/heic", size: 1000, name: "a.heic" }), { ok: true });
  assert.deepEqual(L.checkPhotoPick({ type: "", size: 1000, name: "IMG_1.HEIC" }), { ok: true });
  assert.equal(L.checkPhotoPick({ type: "image/svg+xml", size: 10, name: "a.svg" }).reason, "format");
  assert.equal(L.checkPhotoPick({ type: "application/pdf", size: 10, name: "a.pdf" }).reason, "format");
  assert.equal(L.checkPhotoPick({ type: "image/png", size: 0, name: "a.png" }).reason, "empty");
  assert.equal(L.checkPhotoPick({ type: "image/png", size: 21 * 1024 * 1024, name: "a.png" }).reason, "too_large");
});
test("captions and alt text", () => {
  assert.equal(L.cleanCaption("  Terraza   del  2.º piso "), "Terraza del 2.º piso");
  assert.equal(L.cleanCaption("visite www.x.cr"), undefined);
  assert.equal(L.cleanCaption("https://x.cr"), undefined);
  assert.equal(L.cleanCaption("x".repeat(250)).length, 200);
  assert.equal(L.photoAlt(null, "Soda Tica", 2, false), "Foto 2 de Soda Tica");
  assert.equal(L.photoAlt("", "Soda Tica", 1, true), "Photo 1 of Soda Tica");
  assert.equal(L.photoAlt("Casado", "Soda Tica", 1, false), "Casado");
});
test("URL helpers: own photos map to the same-origin route, seed URLs pass through", () => {
  const url = L.placePhotoUrl(ID);
  assert.equal(L.placePhotoId(url), ID);
  assert.equal(L.placePhotoSrc(url, 320), `/api/fotos-lugar/${ID}?s=320`);
  assert.equal(L.placePhotoSrc("https://cdn.example.org/x.jpg"), "https://cdn.example.org/x.jpg");
  assert.equal(L.placePhotoId("https://contratacr.com/api/fotos-lugar/../x"), null);
});
test("schemas", () => {
  assert.ok(L.placePhotoFieldsSchema.safeParse({ uploadId: ID, review: "1" }).success);
  assert.ok(!L.placePhotoFieldsSchema.safeParse({ uploadId: "x" }).success);
  assert.ok(!L.placePhotoFieldsSchema.safeParse({ uploadId: ID, extra: "1" }).success);
  assert.ok(!L.placePhotoFlagSchema.safeParse({ flagId: ID, reason: "other" }).success, "other needs a message");
  assert.ok(L.placePhotoFlagSchema.safeParse({ flagId: ID, reason: "spam" }).success);
  const d = { kind: "photo", actionId: ID, mediaId: ID, expectedStatus: "pending" };
  assert.ok(L.photoStaffDecisionSchema.safeParse({ ...d, decision: "approve" }).success);
  assert.ok(!L.photoStaffDecisionSchema.safeParse({ ...d, decision: "reject" }).success, "reject needs a reason");
  assert.ok(L.photoStaffDecisionSchema.safeParse({ ...d, decision: "reject", reason: "No es del lugar" }).success);
});
test("server pipeline strips EXIF/GPS, keeps PNG, refuses HEIC/GIF, stable hash", async () => {
  const jpeg = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#3a7" } })
    .withExif({ IFD0: { Make: "Test" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "9/1 56/1 0/1" } }).jpeg().toBuffer();
  assert.ok(P.scanMetadata(new Uint8Array(jpeg)).includes("exif"));
  const r = await P.processListingPhoto(new Uint8Array(jpeg), { photoId: ID, codec });
  assert.equal(r.ok, true);
  for (const v of Object.values(r.photo.variants)) assert.deepEqual(P.scanMetadata(v.bytes), [], "no metadata in " + v.size);
  const again = await P.processListingPhoto(new Uint8Array(jpeg), { photoId: ID, codec });
  assert.equal(again.photo.sha256, r.photo.sha256, "same image → same hash (dedupe)");
  const png = await sharp({ create: { width: 800, height: 800, channels: 4, background: "#fff" } }).png().toBuffer();
  assert.equal((await P.processListingPhoto(new Uint8Array(png), { photoId: ID, codec })).ok, true);
  const heic = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63]);
  assert.equal((await P.processListingPhoto(heic, { photoId: ID, codec })).reason, "heic_unsupported");
  const gif = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#000" } }).gif().toBuffer();
  assert.equal((await P.processListingPhoto(new Uint8Array(gif), { photoId: ID, codec })).reason, "format");
  const small = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#000" } }).jpeg().toBuffer();
  assert.equal((await P.processListingPhoto(new Uint8Array(small), { photoId: ID, codec })).reason, "too_small");
});
