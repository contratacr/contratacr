// Run: node --test scripts/directory/place-photo-store.test.mjs
// Place photo storage adapter (2026-11-26, owner decision: free tiers): new uploads go to the Worker's R2 binding
// PLACE_PHOTOS (keys prefixed by the Supabase project host), and without a binding (next dev, Node tests) to the
// private Supabase bucket exactly as before. Fakes only: no Cloudflare, no Supabase.
import test from "node:test";
import assert from "node:assert/strict";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
const S = await import("../../src/lib/directory/place-photo-store.ts");
const PATH = "dir-places/22222222-2222-4222-8222-222222222222/800.webp";
const bytes = (s) => new TextEncoder().encode(s);

function fakeR2() {
  const objects = new Map(), calls = [];
  return {
    objects, calls,
    async put(key, value, options) {
      calls.push(["put", key, options]);
      if (options?.onlyIf?.etagDoesNotMatch === "*" && objects.has(key)) return null;
      objects.set(key, { value: new Uint8Array(value), contentType: options?.httpMetadata?.contentType });
      return { key };
    },
    async get(key) {
      const o = objects.get(key);
      return o ? { arrayBuffer: async () => o.value.slice().buffer, httpMetadata: { contentType: o.contentType } } : null;
    },
    async delete(keys) { calls.push(["delete", keys]); for (const k of [].concat(keys)) objects.delete(k); },
  };
}
function fakeSupabase() {
  const objects = new Map(), calls = [];
  const bucket = {
    async upload(path, body, options) {
      calls.push(["upload", path, options]);
      if (objects.has(path)) return { error: { statusCode: "409", message: "Duplicate" } };
      objects.set(path, new Uint8Array(body));return { error: null };
    },
    async download(path) {
      return objects.has(path) ? { data: new Blob([objects.get(path)]), error: null } : { data: null, error: { statusCode: "404" } };
    },
    async remove(paths) { calls.push(["remove", paths]); paths.forEach((p) => objects.delete(p)); return { error: null }; },
  };
  return { objects, calls, bucket, db: { storage: { from: (name) => { calls.push(["from", name]); return bucket; } } } };
}

test("R2: put only when free, keys prefixed by project host, get and delete", async () => {
  const r2 = fakeR2(), store = S.createR2PlacePhotoStore(r2, "abc.supabase.co");
  assert.equal(store.name, "r2");
  assert.equal(await store.put(PATH, bytes("one"), "image/webp"), "created");
  assert.ok(r2.objects.has("abc.supabase.co/" + PATH));
  assert.deepEqual(r2.calls[0][2].onlyIf, { etagDoesNotMatch: "*" });
  assert.equal(r2.calls[0][2].httpMetadata.contentType, "image/webp");
  assert.equal(await store.put(PATH, bytes("two"), "image/webp"), "exists", "never overwrites");
  const got = await store.get(PATH);
  assert.equal(new TextDecoder().decode(got.bytes), "one");
  assert.equal(got.contentType, "image/webp");
  assert.equal(await store.get("dir-places/x/320.webp"), null);
  await store.remove([PATH]);
  assert.deepEqual(r2.calls.at(-1), ["delete", ["abc.supabase.co/" + PATH]]);
  assert.equal(r2.objects.size, 0);
  await store.remove([]);assert.equal(r2.calls.filter((c) => c[0] === "delete").length, 1, "empty remove is a no-op");
  assert.throws(() => S.createR2PlacePhotoStore(r2, "../x"), /invalid project host/);
});
test("R2: separate projects sharing the bucket do not see each other", async () => {
  const r2 = fakeR2(), test_ = S.createR2PlacePhotoStore(r2, "test.supabase.co"), prod = S.createR2PlacePhotoStore(r2, "prod.supabase.co");
  await test_.put(PATH, bytes("t"), "image/webp");
  assert.equal(await prod.get(PATH), null);
  assert.equal(await prod.put(PATH, bytes("p"), "image/webp"), "created");
  await test_.remove([PATH]);
  assert.equal(new TextDecoder().decode((await prod.get(PATH)).bytes), "p");
});
test("R2: failures throw (the route answers 503 and cleans up)", async () => {
  const r2 = { put: async () => { throw Error("r2 down"); }, get: async () => { throw Error("r2 down"); }, delete: async () => { throw Error("r2 down"); } };
  const store = S.createR2PlacePhotoStore(r2, "h");
  await assert.rejects(() => store.put(PATH, bytes("x"), "image/webp"));
  await assert.rejects(() => store.get(PATH));
  await assert.rejects(() => store.remove([PATH]));
});
test("Supabase: same calls as before the adapter (upsert:false, 409 = exists, any read error = missing)", async () => {
  const sb = fakeSupabase(), store = S.createSupabasePlacePhotoStore(sb.bucket);
  assert.equal(store.name, "supabase");
  assert.equal(await store.put(PATH, bytes("one"), "image/webp"), "created");
  assert.deepEqual(sb.calls[0], ["upload", PATH, { contentType: "image/webp", upsert: false, cacheControl: "31536000" }]);
  assert.equal(await store.put(PATH, bytes("two"), "image/webp"), "exists");
  assert.equal(new TextDecoder().decode((await store.get(PATH)).bytes), "one");
  assert.equal((await store.get(PATH.replace("800.webp", "800.jpg"))), null);
  await store.remove([PATH]);assert.equal(sb.objects.size, 0);
  const broken = S.createSupabasePlacePhotoStore({ ...sb.bucket, upload: async () => ({ error: { statusCode: "500" } }), remove: async () => ({ error: { message: "x" } }) });
  await assert.rejects(() => broken.put(PATH, bytes("x"), "image/webp"), /upload failed/);
  await assert.rejects(() => broken.remove([PATH]), /remove failed/);
});
test("resolvers: uploads use R2 with a binding and Supabase without; reads follow the recorded store", async () => {
  const sb = fakeSupabase(), r2 = fakeR2();
  assert.equal((await S.uploadPlacePhotoStore(sb.bucket, r2)).name, "r2");
  assert.equal((await S.uploadPlacePhotoStore(sb.bucket, null)).name, "supabase");
  // Outside the Worker (this Node process) the binding lookup finds nothing: Supabase, as in next dev.
  assert.equal(await S.placePhotosR2Binding(), null);
  assert.equal((await S.uploadPlacePhotoStore(sb.bucket)).name, "supabase");
  assert.equal((await S.placePhotoStoreOf(sb.bucket, "supabase", r2)).name, "supabase", "old photos stay on Supabase even with R2");
  assert.equal((await S.placePhotoStoreOf(sb.bucket, undefined, r2)).name, "supabase");
  assert.equal((await S.placePhotoStoreOf(sb.bucket, "r2", r2)).name, "r2");
  assert.equal(await S.placePhotoStoreOf(sb.bucket, "r2", null), null, "R2 photo without a binding: no silent Supabase read");
  const up = await S.uploadPlacePhotoStore(sb.bucket, r2);await up.put(PATH, bytes("z"), "image/webp");
  assert.ok(r2.objects.has("127.0.0.1/" + PATH), "key uses the Supabase project host");
});
