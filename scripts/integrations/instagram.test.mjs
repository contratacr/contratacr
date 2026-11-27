// Run: node --test scripts/integrations/instagram.test.mjs
// "Importar desde Instagram" (2026-11-27, docs/instagram-import.md): the sandbox adapter (fake connect, sample media, generated
// photos) and the import planning (photos only, skip already imported, max 10, unknown ids refused). No network, no database.
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
const T = await import("../../src/lib/integrations/instagram/types.ts");
const S = await import("../../src/lib/integrations/instagram/sandbox.ts");
const P = await import("../../src/lib/directory/photo-pipeline.ts");

test("sandbox: authorize URL points to the local connect screen and carries the state", () => {
  const a = S.createSandboxInstagramAdapter();
  assert.equal(a.provider, "sandbox");
  assert.equal(a.authorizeUrl("abc 1"), "/integraciones/instagram/sandbox?state=abc%201");
});

test("sandbox: only the sandbox code gives a token", async () => {
  const a = S.createSandboxInstagramAdapter();
  const t = await a.exchangeCode(S.SANDBOX_CODE);
  assert.ok(t.accessToken.startsWith(S.SANDBOX_TOKEN_PREFIX));
  assert.equal(t.username, S.SANDBOX_USERNAME);
  assert.ok(Date.parse(t.expiresAt) > Date.now());
  await assert.rejects(a.exchangeCode("other"), (e) => T.instagramErrorCode(e) === "invalid_code");
});

test("sandbox: media list has photos, a carousel and a video; a foreign token is refused", async () => {
  const a = S.createSandboxInstagramAdapter(), { accessToken } = await a.exchangeCode(S.SANDBOX_CODE);
  const list = await a.listMedia(accessToken);
  assert.ok(list.some((m) => m.type === "VIDEO"));
  assert.ok(list.some((m) => m.type === "CAROUSEL_ALBUM"));
  const photos = T.importablePhotos(list);
  assert.equal(photos.length, 8);
  assert.ok(photos.every((m) => m.type !== "VIDEO" && T.MEDIA_ID_RE.test(m.id) && m.permalink?.startsWith("https://www.instagram.com/")));
  await assert.rejects(a.listMedia("real-token"), (e) => T.instagramErrorCode(e) === "token");
});

test("sandbox: fetched photos are real JPEGs the place pipeline accepts; videos are refused", async () => {
  const a = S.createSandboxInstagramAdapter(), { accessToken } = await a.exchangeCode(S.SANDBOX_CODE);
  const list = await a.listMedia(accessToken), photo = T.importablePhotos(list)[1];
  const f = await a.fetchMedia(accessToken, photo);
  assert.equal(f.contentType, "image/jpeg");
  assert.equal(P.sniffPhoto(f.bytes), "image/jpeg");
  const meta = await sharp(f.bytes).metadata();
  assert.ok(Math.max(meta.width, meta.height) >= 1080);
  assert.deepEqual(P.scanMetadata(f.bytes), []);
  await assert.rejects(a.fetchMedia(accessToken, list.find((m) => m.type === "VIDEO")), (e) => T.instagramErrorCode(e) === "media");
  await assert.rejects(a.fetchMedia(accessToken, { ...photo, mediaUrl: "https://evil.example/x.jpg" }), (e) => T.instagramErrorCode(e) === "media");
});

test("planImport: skips already imported, ignores repeats, refuses unknown ids and videos, caps at max", async () => {
  const a = S.createSandboxInstagramAdapter(), { accessToken } = await a.exchangeCode(S.SANDBOX_CODE);
  const list = await a.listMedia(accessToken), ids = T.importablePhotos(list).map((m) => m.id);
  const video = list.find((m) => m.type === "VIDEO").id;
  const plan = T.planImport([ids[0], ids[1], ids[1], video, "../etc", "nope_1"], list, new Set([ids[0]]));
  assert.deepEqual(plan.skipped, [ids[0]]);
  assert.deepEqual(plan.toImport.map((m) => m.id), [ids[1]]);
  assert.deepEqual(plan.unknown, [video, "../etc", "nope_1"]);
  assert.equal(T.planImport(ids, list, new Set(), 3).toImport.length, 3);
  assert.equal(T.planImport(ids, list, new Set()).toImport.length, Math.min(ids.length, T.INSTAGRAM_IMPORT_MAX));
  // Re-importing the same media after a first import: everything already there is skipped, nothing is imported twice.
  const again = T.planImport(ids, list, new Set(ids));
  assert.equal(again.toImport.length, 0);
  assert.equal(again.skipped.length, ids.length);
});

test("safeReturnPath: only in-app relative paths", () => {
  assert.equal(T.safeReturnPath("/dashboard/profesional?x=1"), "/dashboard/profesional?x=1");
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "dashboard", "/a\nb", null, ""]) assert.equal(T.safeReturnPath(bad, "/f"), "/f");
});
