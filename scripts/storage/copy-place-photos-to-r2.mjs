// Copy directory place photos from the private Supabase bucket dir-place-photos to the R2 bucket
// contratacr-place-photos, then mark them photo_store='r2' (storage plan 2026-11-26, docs/storage-plan.md).
// DRY RUN BY DEFAULT: lists what would be copied. --apply copies, verifies and updates.
//
// Required env (pass explicitly, e.g. node --env-file=/private/r2-place.env …; never commit that file):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   source project (its host is the R2 key prefix, exactly as
//                                                        createR2PlacePhotoStore in src/lib/directory/place-photo-store.ts)
//   --apply also needs:
//   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  S3 API credentials of the account that owns the bucket
//   R2_PLACE_PHOTOS_BUCKET                               default contratacr-place-photos (the Worker's PLACE_PHOTOS binding)
// Optional: COPY_REPORT=/private/report.json.
//
// Per photo (status pending/active/hidden, photo_store='supabase'): download the three variants, put them in R2 with
// "<host>/<path>" keys (never overwriting a different object), read them back and compare sha256, and only then set
// photo_store='r2' with compare-and-swap. The Supabase objects are kept (delete them later by hand once verified).
// Idempotent: re-running skips photos already on R2.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { placeObjectKey, sha256 } from './lib.mjs';

const apply = process.argv.includes('--apply');
const env = name => { const v = process.env[name]?.trim(); if (!v) throw new Error(`Missing env ${name}`); return v; };
const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL');
const db = createClient(supabaseUrl, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = process.env.R2_PLACE_PHOTOS_BUCKET?.trim() || 'contratacr-place-photos';
const s3 = apply ? new S3Client({ region: 'auto', endpoint: env('R2_ENDPOINT'), credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') } }) : null;
const report = { project: new URL(supabaseUrl).hostname, bucket, apply, startedAt: new Date().toISOString(), photos: [], errors: [] };
const save = () => { if (process.env.COPY_REPORT) fs.writeFileSync(process.env.COPY_REPORT, JSON.stringify(report, null, 2), { mode: 0o600 }); };
const typeOf = path => path.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';

async function r2Bytes(key) {
  try { const o = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return Buffer.from(await o.Body.transformToByteArray()); }
  catch (e) { if (e.$metadata?.httpStatusCode === 404 || e.name === 'NoSuchKey') return null; throw e; }
}
async function copyObject(path) {
  const key = placeObjectKey(supabaseUrl, path);
  const file = await db.storage.from('dir-place-photos').download(path);
  if (file.error || !file.data) throw new Error(`download failed ${path}`);
  const body = Buffer.from(await file.data.arrayBuffer()), hash = sha256(body);
  const existing = await r2Bytes(key);
  if (existing && sha256(existing) !== hash) throw new Error(`different object already at ${key}`);
  if (!existing) {
    // If-None-Match: never overwrite (same rule as the Worker store's onlyIf etagDoesNotMatch:'*').
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: typeOf(path), CacheControl: 'public, max-age=31536000, immutable', IfNoneMatch: '*' }));
    const back = await r2Bytes(key);
    if (!back || sha256(back) !== hash) throw new Error(`read-back mismatch ${key}`);
  }
  return { key, bytes: body.length, sha256: hash, created: !existing };
}

// Read the whole candidate list first: updated rows leave the filter, so paging while updating would skip rows.
const candidates = [];
for (let from = 0, size = 500; ; from += size) {
  const { data, error } = await db.from('dir_place_media').select('id,status,photo_store,path_1600,path_800,path_320')
    .eq('photo_store', 'supabase').in('status', ['pending', 'active', 'hidden']).not('path_1600', 'is', null).order('id').range(from, from + size - 1);
  if (error) throw error;
  candidates.push(...data);
  if (data.length < size) break;
}
for (const photo of candidates) {
  const paths = [photo.path_1600, photo.path_800, photo.path_320].filter(Boolean);
  const entry = { id: photo.id, paths, keys: paths.map(p => placeObjectKey(supabaseUrl, p)), status: 'planned' };
  report.photos.push(entry);
  if (apply) {
    try {
      entry.objects = [];
      for (const path of paths) entry.objects.push(await copyObject(path));
      const { data: done, error: e } = await db.from('dir_place_media').update({ photo_store: 'r2' }).eq('id', photo.id).eq('photo_store', 'supabase').select('id');
      if (e) throw e;
      entry.status = done.length ? 'copied' : 'skipped-concurrent-change';
    } catch (e) { entry.status = 'error'; report.errors.push({ id: photo.id, error: e.message ?? String(e) }); }
  }
  save();
}
report.finishedAt = new Date().toISOString(); save();
console.log(JSON.stringify({ project: report.project, bucket, apply, photos: report.photos.length, copied: report.photos.filter(p => p.status === 'copied').length, errors: report.errors.length }, null, 2));
if (!apply) console.log('Dry run: nothing was copied or updated. Re-run with --apply to copy.');
if (report.errors.length) process.exitCode = 1;
