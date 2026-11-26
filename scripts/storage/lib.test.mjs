// Run: node --test scripts/storage/lib.test.mjs
// Pure parts of the storage migration scripts (no network, no database).
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as L from './lib.mjs';
const sourceRoot = new URL('../../src/lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context); } });
const U = await import('../../src/lib/r2-image-url.ts');

const SRC = 'https://res.cloudinary.com/dxxrjx2go/image/upload/v1712345/contratacr/portfolio/abc.jpg';

test('detects Cloudinary image URLs only', () => {
  assert.equal(L.isCloudinaryImageUrl(SRC), true);
  assert.equal(L.isCloudinaryImageUrl('https://res.cloudinary.com/x/raw/upload/v1/doc.pdf'), false);
  assert.equal(L.isCloudinaryImageUrl('https://res.cloudinary.com/x/image/upload/v1/doc.pdf'), false);
  assert.equal(L.isCloudinaryImageUrl('https://assets.contratacr.com/a.webp'), false);
  assert.equal(L.isCloudinaryImageUrl(SRC + '?x=1'), false);
  assert.equal(L.isCloudinaryImageUrl(42), false);
});

test('derivatives replace existing transformations', () => {
  assert.equal(L.cloudinaryDerivative(SRC, 'w_400'), 'https://res.cloudinary.com/dxxrjx2go/image/upload/w_400/v1712345/contratacr/portfolio/abc.jpg');
  const transformed = 'https://res.cloudinary.com/dxxrjx2go/image/upload/f_auto,q_auto,c_fill,w_160,h_160/v1712345/contratacr/portfolio/abc.jpg';
  assert.equal(L.cloudinaryDerivative(transformed, 'w_400'), L.cloudinaryDerivative(SRC, 'w_400'));
  const d = L.derivativesFor(SRC, false);
  assert.match(d.main, /\/c_limit,w_1600,h_1600,f_webp,q_82\/v1712345\//);
  assert.match(d.thumb, /\/c_limit,w_400,h_400,f_webp,q_82\//);
  assert.match(L.derivativesFor(SRC, true).main, /f_jpg/);
});

test('migrated keys are deterministic and follow the r2Thumb pair scheme', () => {
  const a = L.migratedKeys(SRC, false), b = L.migratedKeys(SRC, false);
  assert.deepEqual(a, b);
  assert.match(a.main, /^contratacr\/migrated\/[0-9a-f]{32}\.lg\.webp$/);
  assert.equal(U.r2Thumb(`https://assets.contratacr.com/${a.main}`, 200), `https://assets.contratacr.com/${a.thumb}`);
  const j = L.migratedKeys(SRC, true);
  assert.equal(U.r2Thumb(`https://assets.contratacr.com/${j.main}`, 200), `https://assets.contratacr.com/${j.thumb}`, 'JPEG large still has a WebP thumbnail');
});

test('collect + rewrite walk text, arrays and json', () => {
  const value = { items: [{ id: 1, photos: [SRC, 'https://assets.contratacr.com/x.webp'] }], cover: SRC, n: 3 };
  assert.deepEqual([...L.collectCloudinaryUrls(value)], [SRC]);
  const out = L.rewriteValue(value, new Map([[SRC, 'NEW']]));
  assert.deepEqual(out, { items: [{ id: 1, photos: ['NEW', 'https://assets.contratacr.com/x.webp'] }], cover: 'NEW', n: 3 });
  assert.equal(value.cover, SRC, 'input untouched');
  assert.equal(L.pgArray(['a"b', 'c\\d']), '{"a\\"b","c\\\\d"}');
});

test('place photo keys match createR2PlacePhotoStore', () => {
  const path = 'dir-places/8b9633bb-8981-8ed3-a189-f7bcbe6407c7/1600.webp';
  assert.equal(L.placeObjectKey('https://abc.supabase.co', path), `abc.supabase.co/${path}`);
  assert.throws(() => L.placeObjectKey('https://abc.supabase.co', '../etc/passwd'));
});

test('sniffImage accepts only JPEG/WebP', () => {
  assert.equal(L.sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0])), 'image/jpeg');
  assert.equal(L.sniffImage(Buffer.from('RIFF0000WEBPVP8 ', 'ascii')), 'image/webp');
  assert.equal(L.sniffImage(Buffer.from('<svg></svg>')), null);
});
