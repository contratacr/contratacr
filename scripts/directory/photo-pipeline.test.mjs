// Run: node --test scripts/directory/photo-pipeline.test.mjs
// Fixtures are generated in memory with sharp (no downloaded images). sharp is only used by the test and by the
// local codec; the pipeline itself is runtime-neutral (see src/lib/directory/photo-pipeline.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
const P = await import("../../src/lib/directory/photo-pipeline.ts");
const { createSharpPhotoCodec } = await import("../../src/lib/directory/photo-codec-sharp.ts");
const codec = await createSharpPhotoCodec();

const ACTOR = "11111111-1111-4111-8111-111111111111";
const LISTING = "22222222-2222-4222-8222-222222222222";
const UPLOAD = "33333333-3333-4333-8333-333333333333";

/** Gradient + noise so the encoder has real content (a flat image hides resize bugs). */
function raw(width, height) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    data[i] = (x * 255) / width; data[i + 1] = (y * 255) / height; data[i + 2] = (x * y) % 251;
  }
  return sharp(data, { raw: { width, height, channels: 3 } });
}
const GPS_EXIF = {
  IFD0: { Copyright: "Fixture", Artist: "Seller Name", Make: "FixtureCam" },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "9/1 56/1 1234/100", GPSLongitudeRef: "W", GPSLongitude: "84/1 5/1 678/100" },
};
const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="Seller"/></rdf:RDF></x:xmpmeta>';
const jpegWithGps = (w, h, orientation) => {
  let img = raw(w, h).withExif(GPS_EXIF).withXmp(XMP);
  if (orientation) img = img.withMetadata({ orientation });
  return img.jpeg({ quality: 90 }).toBuffer();
};
const run = async (bytes, c = codec) => {
  const { photoId } = await P.photoIdentity(ACTOR, LISTING, UPLOAD);
  return P.processListingPhoto(new Uint8Array(bytes), { photoId, codec: c });
};
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.photo; };

test("fixture really carries GPS EXIF and XMP (the scanner sees it)", async () => {
  const input = await jpegWithGps(2400, 1800);
  const meta = await sharp(input).metadata();
  assert.ok(meta.exif && meta.xmp, "sharp sees EXIF and XMP in the fixture");
  assert.deepEqual(P.scanMetadata(new Uint8Array(input)).sort(), ["exif", "gps", "xmp"]);
});

test("JPEG with GPS: variants 1600/800/320 have the right size and NO metadata", async () => {
  const input = await jpegWithGps(2400, 1800);
  const photo = ok(await run(input));
  assert.deepEqual(photo.sourceMetadata.sort(), ["exif", "gps", "xmp"]);
  const expected = { 1600: [1600, 1200], 800: [800, 600], 320: [320, 240] };
  for (const size of P.PHOTO_VARIANTS) {
    const v = photo.variants[size];
    assert.deepEqual([v.width, v.height], expected[size], `variant ${size}`);
    const m = await sharp(Buffer.from(v.bytes)).metadata();
    assert.deepEqual([m.width, m.height], expected[size], `decoded variant ${size}`);
    assert.equal(m.format, "webp");
    assert.equal(m.exif, undefined, `no EXIF in ${size}`);
    assert.equal(m.xmp, undefined, `no XMP in ${size}`);
    assert.equal(m.iptc, undefined, `no IPTC in ${size}`);
    assert.deepEqual(P.scanMetadata(v.bytes), [], `scanner finds nothing in ${size}`);
    const text = Buffer.from(v.bytes).toString("latin1");
    for (const needle of ["Exif\0", "GPS", "Seller", "FixtureCam", "xmpmeta"]) assert.ok(!text.includes(needle), `${needle} absent in ${size}`);
    assert.equal(v.path, `dir-listings/${photo.id}/${size}.webp`);
    assert.equal(v.contentType, "image/webp");
  }
  assert.equal(photo.exifStripped, true);
  assert.deepEqual([photo.width, photo.height], [1600, 1200]);
});

test("sha256 is of the normalized 1600 bytes, deterministic; raw sha256 kept apart", async () => {
  const input = await jpegWithGps(2000, 1500);
  const a = ok(await run(input)), b = ok(await run(input));
  assert.equal(a.sha256, createHash("sha256").update(a.variants[1600].bytes).digest("hex"));
  assert.equal(a.sourceSha256, createHash("sha256").update(input).digest("hex"));
  assert.equal(a.sha256, b.sha256, "same upload → same normalized hash (retry-safe)");
  assert.match(a.sha256, /^[a-f0-9]{64}$/);
});

test("EXIF orientation is applied before stripping (portrait stays portrait)", async () => {
  const input = await jpegWithGps(2400, 1800, 6); // stored landscape, displayed rotated 90°
  const photo = ok(await run(input));
  assert.deepEqual([photo.variants[1600].width, photo.variants[1600].height], [1200, 1600]);
  assert.deepEqual([photo.variants[320].width, photo.variants[320].height], [240, 320]);
  assert.deepEqual(P.scanMetadata(photo.variants[1600].bytes), []);
});

test("small sources are never enlarged", async () => {
  const photo = ok(await run(await raw(1000, 750).png().toBuffer()));
  assert.deepEqual([photo.variants[1600].width, photo.variants[1600].height], [1000, 750]);
  assert.deepEqual([photo.variants[800].width, photo.variants[800].height], [800, 600]);
  assert.deepEqual([photo.variants[320].width, photo.variants[320].height], [320, 240]);
  assert.equal(photo.sourceType, "image/png");
});

test("WebP with EXIF chunk is cleaned too", async () => {
  const input = await raw(1700, 1700).withExif(GPS_EXIF).webp().toBuffer();
  assert.ok(P.scanMetadata(new Uint8Array(input)).includes("gps"));
  const photo = ok(await run(input));
  assert.deepEqual([photo.width, photo.height], [1600, 1600]);
  assert.deepEqual(P.scanMetadata(photo.variants[800].bytes), []);
});

test("rejections: database size contract, type by magic bytes, caps", async () => {
  const reason = async (bytes) => (await run(bytes)).reason;
  assert.equal(await reason(await raw(600, 400).png().toBuffer()), "too_small");
  assert.equal(await reason(await raw(4000, 400).jpeg().toBuffer()), "aspect");
  assert.equal(await reason(Buffer.alloc(0)), "empty");
  assert.equal(await reason(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), "format");
  assert.equal(await reason(await raw(800, 800).gif().toBuffer()), "format");
  const heic = Buffer.alloc(64); heic.write("ftypheic", 4, "latin1");
  assert.equal(await reason(heic), "heic_unsupported");
  const huge = Buffer.alloc(P.PHOTO_MAX_BYTES + 1); huge[0] = 0xff; huge[1] = 0xd8; huge[2] = 0xff;
  assert.equal(await reason(huge), "too_large");
  // A PNG header claiming 10000×10000 is refused before any decoding (decompression bomb).
  const bomb = Buffer.from(await raw(700, 700).png().toBuffer()); bomb.writeUInt32BE(10000, 16); bomb.writeUInt32BE(10000, 20);
  assert.equal(await reason(bomb), "too_many_pixels");
  // Animated WebP (VP8X animation flag).
  const anim = Buffer.alloc(40); anim.write("RIFF", 0, "latin1"); anim.write("WEBPVP8X", 8, "latin1"); anim[20] = 0x02;
  anim.writeUIntLE(999, 24, 3); anim.writeUIntLE(999, 27, 3);
  assert.equal(await reason(anim), "animated");
  // JPEG magic + garbage.
  assert.equal(await reason(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]), Buffer.alloc(64, 7)])), "unreadable");
});

test("the codec is not trusted: kept EXIF or wrong sizes are refused", async () => {
  const input = await jpegWithGps(2400, 1800);
  const leaky = { name: "leaky", resize: async (b, box) => new Uint8Array(await sharp(Buffer.from(b)).resize(box, box, { fit: "inside" }).withExif(GPS_EXIF).webp().toBuffer()) };
  assert.equal((await run(input, leaky)).reason, "metadata");
  const wrong = { name: "wrong", resize: async (b) => new Uint8Array(await sharp(Buffer.from(b)).resize(300, 300).webp().toBuffer()) };
  assert.equal((await run(input, wrong)).reason, "codec");
  const png = { name: "png", resize: async (b, box) => new Uint8Array(await sharp(Buffer.from(b)).resize(box, box, { fit: "inside" }).png().toBuffer()) };
  assert.equal((await run(input, png)).reason, "codec");
  const broken = { name: "broken", resize: async () => { throw new Error("boom"); } };
  assert.equal((await run(input, broken)).reason, "codec");
});

test("ids: derived from (actor, listing, upload), stable, v8 uuid; paths never contain the listing id", async () => {
  const a = await P.photoIdentity(ACTOR, LISTING, UPLOAD), b = await P.photoIdentity(ACTOR, LISTING, UPLOAD);
  const other = await P.photoIdentity(ACTOR, LISTING, "44444444-4444-4444-8444-444444444444");
  const otherActor = await P.photoIdentity("55555555-5555-4555-8555-555555555555", LISTING, UPLOAD);
  assert.deepEqual(a, b);
  assert.notEqual(a.photoId, other.photoId);
  assert.notEqual(a.photoId, otherActor.photoId, "another account cannot aim at the same photo id");
  assert.notEqual(a.photoId, a.actionId);
  for (const id of [a.photoId, a.actionId]) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const photo = ok(await run(await jpegWithGps(1600, 1200)));
  const media = P.toListingMediaInput(photo, { altEs: "  Frente del carro  ", altEn: "" });
  assert.equal(media.id, a.photoId);
  for (const k of ["path1600", "path800", "path320"]) {
    assert.match(media[k], new RegExp(`^dir-listings/${a.photoId}/(1600|800|320)\\.(webp|jpg)$`));
    assert.ok(!media[k].includes(LISTING));
  }
  assert.equal(media.altEs, "Frente del carro");
  assert.ok(!("altEn" in media));
  assert.equal(media.exifStripped, true);
  await assert.rejects(() => P.photoIdentity("not-a-uuid", LISTING, UPLOAD));
});

test("header reader matches the decoder on generated JPEG/PNG/WebP (lossy and lossless)", async () => {
  for (const [w, h] of [[641, 203], [1024, 683], [1600, 1600]]) {
    for (const enc of [(s) => s.jpeg(), (s) => s.png(), (s) => s.webp(), (s) => s.webp({ lossless: true })]) {
      const bytes = new Uint8Array(await enc(raw(w, h)).toBuffer());
      const head = P.readHeader(bytes);
      assert.deepEqual([head.width, head.height, head.animated], [w, h, false]);
    }
  }
});
