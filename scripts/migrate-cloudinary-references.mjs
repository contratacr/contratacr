// Private snapshot/report paths must be outside Git. Dry run by default.
// MEDIA_ENV_FILE=.env.test MEDIA_SNAPSHOT=/private/refs.json
// MEDIA_INVENTORY=/private/inventory.json MEDIA_REPORT=/private/changes.json
// node --env-file=/private/r2.env scripts/migrate-cloudinary-references.mjs [--apply]
// Originals remain in Cloudinary; every database update uses compare-and-swap.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const { MEDIA_ENV_FILE, MEDIA_SNAPSHOT, MEDIA_INVENTORY, MEDIA_REPORT } = process.env;
if (![MEDIA_ENV_FILE, MEDIA_SNAPSHOT, MEDIA_INVENTORY, MEDIA_REPORT].every(Boolean)) throw new Error('Set all four MEDIA paths explicitly.');
process.loadEnvFile(MEDIA_ENV_FILE);
const apply = process.argv.includes('--apply');
const snapshot = JSON.parse(fs.readFileSync(MEDIA_SNAPSHOT, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(MEDIA_INVENTORY, 'utf8'));
const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
if (project !== snapshot.project) throw new Error('Snapshot belongs to another database.');
if (apply && (process.env.R2_BUCKET !== 'contratacr-assets' || process.env.R2_ENDPOINT !== 'https://5caf14b53df75c99c1356e3ada70768c.r2.cloudflarestorage.com')) throw new Error('Unexpected R2 destination.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const storage = apply ? new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } }) : null;
const report = { project, apply, startedAt: new Date().toISOString(), assets: [], changes: [] };
const save = () => {
  fs.writeFileSync(`${MEDIA_REPORT}.partial`, JSON.stringify(report, null, 2), { mode: 0o600 });
  fs.renameSync(`${MEDIA_REPORT}.partial`, MEDIA_REPORT);
};
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml' };
const fields = {
  profiles: { avatar_url: 'text' },
  professionals: { portfolio_urls: 'array', portfolio_items: 'json', certifications: 'json', services: 'json' },
  professional_offers: { image_urls: 'array' },
  professional_activity: { image_url: 'text' },
  projects: { photo_urls: 'array' },
  direct_messages: { attachment_urls: 'json' },
  support_ticket_messages: { attachments: 'json' },
};
const professionals = new Map(snapshot.tables.professionals.map(p => [p.id, p.profile_id]));
const assets = new Map(inventory.map(a => [a.secure_url, a]));
const cache = new Map();
async function getBytes(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Media HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > 50 * 1024 * 1024) throw new Error('Media exceeds limit.');
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 50 * 1024 * 1024) throw new Error('Media exceeds limit.');
  return body;
}
async function migrateUrl(source, userId, avatar) {
  if (!source.startsWith('https://res.cloudinary.com/')) return source;
  if (!/^[a-f0-9-]{36}$/.test(userId ?? '')) throw new Error('Missing media owner.');
  const cacheKey = `${userId}:${avatar}:${source}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const asset = assets.get(source);
  if (!asset || !types[asset.format] || !new URL(source).pathname.startsWith('/dxxrjx2go/image/upload/')) throw new Error('Source is not in the reviewed inventory.');
  const input = await getBytes(source);
  if (input.length !== asset.bytes) throw new Error('Source changed after inventory.');
  let body = input, format = asset.format;
  if (format !== 'svg') {
    const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    if ((metadata.pages ?? 1) === 1) {
      const widths = avatar ? [800, 600, 400] : [1600, 1200, 800];
      const budget = (avatar ? 150 : 512) * 1024;
      for (const width of widths) {
        const candidate = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toBuffer();
        if (candidate.length < body.length || Math.max(metadata.width, metadata.height) > widths[0]) { body = candidate; format = 'webp'; }
        if (body.length <= budget) break;
      }
      if (avatar && body.length > budget) throw new Error('Avatar exceeds optimized budget.');
    }
  }
  const hash = digest(body);
  const key = `contratacr/${avatar ? 'profiles' : 'media'}/${userId}/cloudinary-v1/${hash.slice(0, 32)}.${format}`;
  const destination = `https://assets.contratacr.com/${key}`;
  const entry = { userId, source, destination, key, sha256: hash, originalBytes: input.length, bytes: body.length, status: 'planned' };
  report.assets.push(entry); save();
  if (apply) {
    let existing;
    try { existing = await storage.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })); }
    catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
    if (existing && (existing.Metadata?.sha256 !== hash || existing.ContentLength !== body.length)) throw new Error('Destination collision.');
    if (!existing) await storage.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: types[format], CacheControl: 'public, max-age=31536000, immutable', Metadata: { sha256: hash } }));
    if (digest(await getBytes(destination)) !== hash) throw new Error('Public derivative checksum mismatch.');
    const { error } = await db.from('user_media_assets').upsert({ user_id: userId, provider: 'r2', public_id: key, resource_type: 'image', secure_url: destination }, { onConflict: 'provider,public_id' });
    if (error) throw error;
    entry.status = 'verified'; save();
  }
  cache.set(cacheKey, destination);
  return destination;
}
async function replace(value, userId, avatar) {
  if (typeof value === 'string') return migrateUrl(value, userId, avatar);
  if (Array.isArray(value)) { const result = []; for (const item of value) result.push(await replace(item, userId, avatar)); return result; }
  if (value && typeof value === 'object') { const result = {}; for (const [key, item] of Object.entries(value)) result[key] = await replace(item, userId, avatar); return result; }
  return value;
}
const pgArray = values => `{${values.map(v => `"${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`;
async function migrateRow(table, columns, row) {
    const userId = table === 'profiles' ? row.id : row.profile_id ?? professionals.get(row.professional_id) ?? row.client_id ?? row.sender_id;
    const relevant = Object.keys(columns).filter(column => JSON.stringify(row[column])?.includes('https://res.cloudinary.com/'));
    if (!relevant.length) return;
    // The existing trigger publishes only previously unseen content IDs. Refuse
    // legacy items without an existing activity to avoid notifying followers.
    if (table === 'professionals') {
      for (const column of relevant.filter(c => ['portfolio_items', 'services'].includes(c))) {
        for (const item of row[column] ?? []) {
          if (!JSON.stringify(item).includes('https://res.cloudinary.com/')) continue;
          const id = item.id ?? item.serviceId;
          const type = column === 'services' ? 'service' : 'success_case';
          if (!id || !snapshot.tables.professional_activity.some(a => a.professional_id === row.id && a.activity_type === type && a.content_id === id)) throw new Error('Activity guard failed; row unchanged.');
        }
      }
    }
    const before = {}, after = {};
    for (const column of relevant) { before[column] = row[column]; after[column] = await replace(row[column], userId, table === 'profiles'); }
    const entry = { table, id: row.id, before, after, status: 'planned' }; report.changes.push(entry); save();
    if (apply) {
      let query = db.from(table).update(after).eq('id', row.id);
      for (const column of relevant) query = query.filter(column, 'eq', columns[column] === 'array' ? pgArray(before[column]) : columns[column] === 'json' ? JSON.stringify(before[column]) : before[column]);
      const { data, error } = await query.select(Object.keys(after).join(','));
      if (error) throw error;
      entry.status = data.length ? 'updated' : 'skipped-concurrent-change';
      if (data.length && !isDeepStrictEqual(data[0], after)) {
        entry.status = 'verification-failed'; save();
        throw new Error('Database read-back differs from the requested media update.');
      }
      save();
    }
}
for (const [table, columns] of Object.entries(fields)) {
  const rows = snapshot.tables[table] ?? [];
  let cursor = 0;
  const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    while (cursor < rows.length) await migrateRow(table, columns, rows[cursor++]);
  }));
  const errors = results.filter(result => result.status === 'rejected');
  if (errors.length) {
    report.errors = errors.map(result => result.reason?.message ?? String(result.reason)); save();
    throw new Error(report.errors.join('; '));
  }
}
report.finishedAt = new Date().toISOString(); save();
console.log(JSON.stringify({ project, apply, assets: report.assets.length, changes: report.changes.length, updated: report.changes.filter(c => c.status === 'updated').length, skipped: report.changes.filter(c => c.status === 'skipped-concurrent-change').length, originalBytes: report.assets.reduce((n,a) => n + a.originalBytes, 0), bytes: report.assets.reduce((n,a) => n + a.bytes, 0) }));
