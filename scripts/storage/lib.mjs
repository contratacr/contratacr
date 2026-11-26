// Pure helpers of scripts/storage/*.mjs (storage plan 2026-11-26, docs/storage-plan.md). No I/O; unit-tested in
// scripts/storage/lib.test.mjs. Key naming must stay in sync with src/lib/r2-image-url.ts (pairedKeys) and
// src/lib/directory/place-photo-store.ts (createR2PlacePhotoStore).
import crypto from 'node:crypto';

/**
 * Every public text/array/json column that can hold a res.cloudinary.com URL (schema search 2026-11-26 over
 * information_schema: url/image/photo/avatar/logo/cover/media/attachment/portfolio columns). user_media_assets is the
 * ownership ledger: it is NOT rewritten; the script adds the matching provider='r2' rows instead.
 */
export const MIGRATION_FIELDS = {
  profiles: { avatar_url: 'text' },
  professionals: { portfolio_urls: 'array', portfolio_items: 'json', certifications: 'json', services: 'json' },
  professional_offers: { image_urls: 'array' },
  professional_activity: { image_url: 'text' },
  projects: { photo_urls: 'array' },
  direct_messages: { attachment_urls: 'json' },
  support_ticket_messages: { attachments: 'json' },
  job_applications: { portfolio_url: 'text' },
  subscription_payments: { receipt_url: 'text' },
  dir_place_media: { url: 'text' },
  moderation_photo_holds: { url: 'text' },
  pro_ad_builds: { image_url: 'text' },
  pro_menu_items: { photo_url: 'text' },
};
/** Primary key per table when it is not `id`. */
export const KEY_COLUMN = { moderation_photo_holds: 'professional_id' };
/** Columns whose image is read by the share card (Satori: JPEG/PNG only) → large file stays JPEG. */
export const JPEG_COLUMNS = new Set(['profiles.avatar_url']);

const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/([a-z0-9_-]+)\/image\/upload\/(.+)$/i;
const TRANSFORM = /^[a-z]{1,3}_[^/]*$/;

/** A Cloudinary IMAGE url (raw/video uploads and PDFs are left alone). */
export function isCloudinaryImageUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  const m = CLOUDINARY.exec(value);
  if (!m || /[?#]/.test(value)) return false;
  return !/\.(pdf|svg)$/i.test(m[2]);
}

/** Same asset with `transform` instead of any transformation already in the URL. */
export function cloudinaryDerivative(url, transform) {
  const m = CLOUDINARY.exec(url);
  if (!m) throw new Error('not a Cloudinary image url');
  const segments = m[2].split('/');
  while (segments.length > 1 && TRANSFORM.test(segments[0]) && !/^v\d+$/.test(segments[0])) segments.shift();
  return `https://res.cloudinary.com/${m[1]}/image/upload/${transform}/${segments.join('/')}`;
}

/** The two derivatives fetched per source: large (1600 WebP, or 800 JPEG for card-read columns) and 400 WebP thumbnail. */
export function derivativesFor(url, jpeg) {
  return {
    main: cloudinaryDerivative(url, jpeg ? 'c_limit,w_800,h_800,f_jpg,q_85' : 'c_limit,w_1600,h_1600,f_webp,q_82'),
    thumb: cloudinaryDerivative(url, 'c_limit,w_400,h_400,f_webp,q_82'),
  };
}

/** Deterministic R2 keys of a migrated URL (idempotent re-runs land on the same objects). */
export function migratedKeys(url, jpeg) {
  const base = `contratacr/migrated/${crypto.createHash('sha256').update(url).digest('hex').slice(0, 32)}`;
  return { main: `${base}.lg.${jpeg ? 'jpg' : 'webp'}`, thumb: `${base}.sm.webp` };
}

/** Every Cloudinary image URL inside a text/array/json value. */
export function collectCloudinaryUrls(value, out = new Set()) {
  if (typeof value === 'string') { if (isCloudinaryImageUrl(value)) out.add(value); }
  else if (Array.isArray(value)) for (const item of value) collectCloudinaryUrls(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectCloudinaryUrls(item, out);
  return out;
}

/** Deep copy of `value` with every string found in `map` replaced by its new URL. */
export function rewriteValue(value, map) {
  if (typeof value === 'string') return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map(item => rewriteValue(item, map));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteValue(v, map)]));
  return value;
}

/** PostgREST literal of a text[] value for compare-and-swap filters. */
export const pgArray = values => `{${values.map(v => `"${String(v).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`;

/** R2 key of a place photo object: "<supabase project host>/<path>" (createR2PlacePhotoStore). */
export function placeObjectKey(supabaseUrl, path) {
  const host = new URL(supabaseUrl).hostname;
  if (!/^dir-places\/[0-9a-f-]{36}\/(1600|800|320)\.(webp|jpg)$/.test(path)) throw new Error(`unexpected place photo path ${path}`);
  return `${host}/${path}`;
}

export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/** Magic-byte type of a downloaded derivative (the migration refuses anything else). */
export function sniffImage(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
