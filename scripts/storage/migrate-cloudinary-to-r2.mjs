// Cloudinary → R2 migration of public photos (storage plan 2026-11-26, docs/storage-plan.md).
// DRY RUN BY DEFAULT: it only reads the database and prints what it would do. --apply downloads, uploads and rewrites.
//
// Required env (pass them explicitly, e.g. node --env-file=/private/r2-migration.env …; never commit that file):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   database to scan/rewrite (service role: bypasses RLS)
//   --apply also needs:
//   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  S3 API credentials of the R2 account
//   R2_BUCKET                                            public assets bucket (served by R2_PUBLIC_BASE_URL)
//   R2_PUBLIC_BASE_URL                                   e.g. https://assets.contratacr.com (no trailing slash)
// Optional: MIGRATION_REPORT=/private/report.json (default: stdout only), MIGRATION_LIMIT=<n rows per table>.
//
// For every res.cloudinary.com IMAGE url found in MIGRATION_FIELDS (scripts/storage/lib.mjs):
//   1. downloads two derivatives from Cloudinary: large (w_1600 f_webp; profiles.avatar_url: w_800 f_jpg because the
//      share card cannot read WebP) and the 400 px WebP thumbnail,
//   2. uploads them as contratacr/migrated/<sha>.lg.<ext> + .sm.webp (the pair r2Thumb understands); existing objects
//      of the same size are kept (idempotent),
//   3. rewrites the row with compare-and-swap (only if the column still holds the old value),
//   4. adds provider='r2' rows to user_media_assets for owners recorded with the Cloudinary URL.
// Cloudinary originals are never deleted. Re-running after a partial run continues where it stopped.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { MIGRATION_FIELDS, KEY_COLUMN, JPEG_COLUMNS, collectCloudinaryUrls, derivativesFor, migratedKeys, rewriteValue, pgArray, sha256, sniffImage } from './lib.mjs';

const apply = process.argv.includes('--apply');
const env = name => { const v = process.env[name]?.trim(); if (!v) throw new Error(`Missing env ${name}`); return v; };
const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = apply ? env('R2_BUCKET') : process.env.R2_BUCKET ?? '(R2_BUCKET)';
const publicBase = (apply ? env('R2_PUBLIC_BASE_URL') : process.env.R2_PUBLIC_BASE_URL ?? 'https://assets.contratacr.com').replace(/\/+$/, '');
const s3 = apply ? new S3Client({ region: 'auto', endpoint: env('R2_ENDPOINT'), credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') } }) : null;
const limit = Number(process.env.MIGRATION_LIMIT) || Infinity;
const report = { project: new URL(env('NEXT_PUBLIC_SUPABASE_URL')).hostname, apply, startedAt: new Date().toISOString(), assets: [], rows: [], skipped: [], errors: [] };
const save = () => { if (process.env.MIGRATION_REPORT) fs.writeFileSync(process.env.MIGRATION_REPORT, JSON.stringify(report, null, 2), { mode: 0o600 }); };

async function download(url) {
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const body = Buffer.from(await r.arrayBuffer());
  if (body.length > 20 * 1024 * 1024) throw new Error(`too large ${url}`);
  const type = sniffImage(body);
  if (!type) throw new Error(`not JPEG/WebP ${url}`);
  return { body, type };
}
async function ensureObject(key, sourceUrl) {
  try { const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); if (head.ContentLength > 0) return 'exists'; }
  catch (e) { if (e.$metadata?.httpStatusCode !== 404) throw e; }
  const { body, type } = await download(sourceUrl);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type, CacheControl: 'public, max-age=31536000, immutable', Metadata: { sha256: sha256(body), source: sourceUrl.slice(0, 1024) } }));
  return 'created';
}

/** source url + jpeg flag → new public URL (memoized; the same source is migrated once per format). */
const migrated = new Map();
async function migrateUrl(source, jpeg) {
  const memo = `${jpeg}:${source}`;
  if (migrated.has(memo)) return migrated.get(memo);
  const keys = migratedKeys(source, jpeg), from = derivativesFor(source, jpeg);
  const entry = { source, jpeg, keys, status: 'planned' };
  report.assets.push(entry);
  if (apply) {
    entry.thumb = await ensureObject(keys.thumb, from.thumb); // thumbnail first: the large URL implies its sibling
    entry.main = await ensureObject(keys.main, from.main);
    entry.status = 'stored';
  }
  const result = { url: `${publicBase}/${keys.main}`, keys };
  migrated.set(memo, result);
  return result;
}

// The professionals trigger publishes activity for content ids it has not seen; rewriting a legacy item without an
// activity row would notify followers. Such rows are left unchanged (same guard as migrate-cloudinary-references.mjs).
class GuardError extends Error {}
async function activityGuard(row, relevant) {
  const items = relevant.filter(c => c === 'portfolio_items' || c === 'services').flatMap(c => (row[c] ?? []).filter(i => collectCloudinaryUrls(i).size).map(i => ({ id: i.id ?? i.serviceId, type: c === 'services' ? 'service' : 'success_case' })));
  if (!items.length) return;
  const { data, error } = await db.from('professional_activity').select('activity_type,content_id').eq('professional_id', row.id);
  if (error) throw error;
  if (items.some(i => !i.id || !data.some(a => a.activity_type === i.type && a.content_id === i.id))) throw new GuardError('activity guard: legacy item without activity, row left unchanged');
}

async function* rows(table, columns) {
  const size = 500, key = KEY_COLUMN[table] ?? 'id';
  for (let from = 0, seen = 0; seen < limit; from += size) {
    const { data, error } = await db.from(table).select([...new Set([key, ...columns])].join(',')).order(key).range(from, from + size - 1);
    if (error) { report.skipped.push({ table, reason: error.message }); return; }
    for (const row of data) { if (seen++ >= limit) return; yield { ...row, id: row[key] }; }
    if (data.length < size) return;
  }
}

for (const [table, columns] of Object.entries(MIGRATION_FIELDS)) {
  for await (const row of rows(table, Object.keys(columns))) {
    const relevant = Object.keys(columns).filter(c => collectCloudinaryUrls(row[c]).size);
    if (!relevant.length) continue;
    try {
      if (table === 'professionals') await activityGuard(row, relevant);
      const before = {}, after = {};
      for (const column of relevant) {
        const map = new Map();
        for (const url of collectCloudinaryUrls(row[column])) map.set(url, (await migrateUrl(url, JPEG_COLUMNS.has(`${table}.${column}`))).url);
        before[column] = row[column]; after[column] = rewriteValue(row[column], map);
      }
      const entry = { table, id: row.id, before, after, status: 'planned' };
      report.rows.push(entry);
      if (apply) {
        let q = db.from(table).update(after).eq(KEY_COLUMN[table] ?? 'id', row.id);
        for (const c of relevant) q = q.filter(c, 'eq', columns[c] === 'array' ? pgArray(before[c]) : columns[c] === 'json' ? JSON.stringify(before[c]) : before[c]);
        const { data, error } = await q.select(KEY_COLUMN[table] ?? 'id');
        if (error) throw error;
        entry.status = data.length ? 'updated' : 'skipped-concurrent-change';
      }
    } catch (e) {
      if (e instanceof GuardError) report.skipped.push({ table, id: row.id, reason: e.message });
      else report.errors.push({ table, id: row.id, error: e.message ?? String(e) });
    }
    save();
  }
}

// Ownership ledger: an owner of a Cloudinary asset also owns its R2 copies (account deletion / photo removal).
for await (const asset of rows('user_media_assets', ['user_id', 'provider', 'secure_url'])) {
  if (asset.provider !== 'cloudinary') continue;
  for (const jpeg of [false, true]) {
    const done = migrated.get(`${jpeg}:${asset.secure_url}`);
    if (!done) continue;
    const ledger = [done.keys.main, done.keys.thumb].map(key => ({ user_id: asset.user_id, provider: 'r2', public_id: key, resource_type: 'image', secure_url: `${publicBase}/${key}` }));
    report.rows.push({ table: 'user_media_assets', id: asset.id, add: ledger.map(l => l.public_id), status: 'planned' });
    if (apply) {
      const { error } = await db.from('user_media_assets').upsert(ledger, { onConflict: 'provider,public_id' });
      if (error) report.errors.push({ table: 'user_media_assets', id: asset.id, error: error.message });
      else report.rows.at(-1).status = 'updated';
    }
  }
}

report.finishedAt = new Date().toISOString(); save();
console.log(JSON.stringify({
  project: report.project, apply, bucket, assets: report.assets.length,
  rows: report.rows.length, updated: report.rows.filter(r => r.status === 'updated').length,
  concurrent: report.rows.filter(r => r.status === 'skipped-concurrent-change').length,
  skipped: report.skipped, errors: report.errors.length,
}, null, 2));
if (!apply) console.log('Dry run: nothing was downloaded, uploaded or rewritten. Re-run with --apply to migrate.');
if (report.errors.length) process.exitCode = 1;
