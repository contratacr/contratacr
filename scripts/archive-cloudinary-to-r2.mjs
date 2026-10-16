// Copy-only migration. Cloudinary originals and database references are retained.
// MEDIA_INVENTORY=/private/inventory.json MEDIA_REPORT=/private/report.json
// node --env-file=/private/r2.env scripts/archive-cloudinary-to-r2.mjs [--apply]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const apply = process.argv.includes('--apply');
const { MEDIA_INVENTORY, MEDIA_REPORT } = process.env;
if (!MEDIA_INVENTORY || !MEDIA_REPORT) throw new Error('Set MEDIA_INVENTORY and MEDIA_REPORT explicitly.');
const inventory = JSON.parse(fs.readFileSync(MEDIA_INVENTORY, 'utf8'));
const base = 'https://assets.contratacr.com';
const cloud = 'dxxrjx2go';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const previous = fs.existsSync(MEDIA_REPORT) ? JSON.parse(fs.readFileSync(MEDIA_REPORT, 'utf8')) : null;
if (previous && (previous.cloud !== cloud || previous.apply !== apply)) throw new Error('Report belongs to another operation.');
const report = previous ?? { cloud, apply, assets: [], startedAt: new Date().toISOString() };
const save = () => {
  fs.writeFileSync(`${MEDIA_REPORT}.partial`, JSON.stringify(report, null, 2), { mode: 0o600 });
  fs.renameSync(`${MEDIA_REPORT}.partial`, MEDIA_REPORT);
};
if (apply && ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].some(k => !process.env[k])) throw new Error('Missing R2 credentials.');
if (apply && (process.env.R2_BUCKET !== 'contratacr-assets' || process.env.R2_ENDPOINT !== 'https://5caf14b53df75c99c1356e3ada70768c.r2.cloudflarestorage.com')) throw new Error('Unexpected migration destination.');
const storage = apply ? new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } }) : null;
const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml' };
async function download(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > 50 * 1024 * 1024) throw new Error('Asset exceeds limit.');
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 50 * 1024 * 1024) throw new Error('Asset exceeds limit.');
  return body;
}
let cursor = 0;
async function worker() {
  while (cursor < inventory.length) {
    const asset = inventory[cursor++];
    const source = new URL(asset.secure_url);
    if (source.hostname !== 'res.cloudinary.com' || !source.pathname.startsWith(`/${cloud}/image/upload/`) || source.search || !types[asset.format]) throw new Error('Unsupported source asset.');
    const identity = `${asset.public_id}:${asset.version}`;
    const key = `contratacr/legacy-cloudinary/${cloud}/${sha(identity).slice(0, 32)}.${asset.format}`;
    const destination = `${base}/${key}`;
    let entry = report.assets.find(item => item.identity === identity);
    if (entry?.status === 'verified') continue;
    entry ??= { identity, source: asset.secure_url, destination, key, expectedBytes: asset.bytes, status: 'planned' };
    if (!report.assets.includes(entry)) report.assets.push(entry);
    save();
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const body = await download(source);
        if (body.length !== asset.bytes) throw new Error('Cloudinary byte count changed.');
        entry.sha256 = sha(body);
        if (apply) {
          let existing;
          try { existing = await storage.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })); }
          catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
          if (existing && (existing.Metadata?.sha256 !== entry.sha256 || existing.ContentLength !== body.length)) throw new Error('Destination collision; original retained.');
          if (!existing) await storage.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: types[asset.format], CacheControl: 'public, max-age=31536000, immutable', Metadata: { sha256: entry.sha256 } }));
          const check = await download(destination);
          if (sha(check) !== entry.sha256) throw new Error('Public copy checksum mismatch.');
          entry.status = 'verified';
        } else entry.status = 'planned';
        delete entry.error;
        break;
      } catch (error) {
        entry.status = 'failed'; entry.error = error.message;
        if (attempt === 3) break;
      }
    }
    save();
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
report.finishedAt = new Date().toISOString(); save();
console.log(JSON.stringify({ apply, assets: report.assets.length, verified: report.assets.filter(a => a.status === 'verified').length, failed: report.assets.filter(a => a.status === 'failed').length, bytes: report.assets.reduce((n, a) => n + a.expectedBytes, 0) }));
if (report.assets.some(a => a.status === 'failed')) process.exitCode = 1;
