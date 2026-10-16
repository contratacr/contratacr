// Dry run by default. Originals are retained; every published derivative is owned
// by the same user. The CAS update never replaces a photo changed during the run.
// PHOTO_ENV_FILE=.env.test PHOTO_REPORT=/tmp/profile-photos.json node scripts/optimize-profile-photos.mjs
// Apply additionally requires --apply and the existing R2 credentials.
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const envFile = process.env.PHOTO_ENV_FILE;
if (!envFile || !process.env.PHOTO_REPORT) throw new Error('Set PHOTO_ENV_FILE and PHOTO_REPORT explicitly.');
process.loadEnvFile(envFile);
const apply = process.argv.includes('--apply');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const base = 'https://assets.contratacr.com';
if (apply && ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].some(k => !process.env[k])) throw new Error('Missing existing R2 credentials; no changes made.');
const storage = apply ? new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } }) : null;
const report = { project: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, apply, photos: [] };
const save = () => fs.writeFileSync(process.env.PHOTO_REPORT, JSON.stringify(report, null, 2), { mode: 0o600 });
for (let start = 0; ; start += 500) {
  const { data, error } = await db.from('profiles').select('id,avatar_url').like('avatar_url', `${base}/contratacr/profiles/%`).order('id').range(start, start + 499);
  if (error) throw error;
  for (const profile of data) {
    const url = new URL(profile.avatar_url);
    if (!url.pathname.startsWith(`/contratacr/profiles/${profile.id}/`) || url.pathname.includes('/optimized-v1/')) continue;
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Photo fetch failed: ${response.status}`);
    if (Number(response.headers.get('content-length')) > 10 * 1024 * 1024) throw new Error('Photo exceeds processing limit.');
    const input = Buffer.from(await response.arrayBuffer());
    if (input.length > 10 * 1024 * 1024) throw new Error('Photo exceeds processing limit.');
    if (input.length <= 150 * 1024) continue;
    const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    if ((metadata.pages ?? 1) > 1) continue; // Do not flatten animations.
    let output;
    for (const width of [800, 600, 400]) {
      output = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toBuffer();
      if (output.length <= 150 * 1024) break;
    }
    if (output.length > 150 * 1024 || output.length >= input.length) continue;
    const hash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 24);
    const key = `contratacr/profiles/${profile.id}/optimized-v1/${hash}.webp`;
    const next = `${base}/${key}`;
    const entry = { userId: profile.id, before: profile.avatar_url, after: next, originalBytes: input.length, optimizedBytes: output.length, status: 'planned' };
    report.photos.push(entry); save();
    if (apply) {
      await storage.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: output, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
      const { error: ownershipError } = await db.from('user_media_assets').upsert({ user_id: profile.id, provider: 'r2', public_id: key, resource_type: 'image', secure_url: next }, { onConflict: 'provider,public_id' });
      if (ownershipError) throw ownershipError;
      const check = await fetch(next, { redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!check.ok || !Buffer.from(await check.arrayBuffer()).equals(output)) throw new Error('Public derivative verification failed; profile unchanged.');
      const { data: updated, error: updateError } = await db.from('profiles').update({ avatar_url: next }).eq('id', profile.id).eq('avatar_url', profile.avatar_url).select('id');
      if (updateError) throw updateError;
      entry.status = updated.length ? 'updated' : 'skipped-concurrent-change'; save();
    }
  }
  if (data.length < 500) break;
}
save();
console.log(JSON.stringify({ project: report.project, apply, photos: report.photos.length, originalBytes: report.photos.reduce((n,p)=>n+p.originalBytes,0), optimizedBytes: report.photos.reduce((n,p)=>n+p.optimizedBytes,0) }));
