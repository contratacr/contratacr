import { test, expect } from 'playwright/test';
import { build } from 'esbuild';

test('camera images respect avatar and public-gallery budgets while small images stay intact', async ({ page }) => {
  const bundle = await build({ entryPoints: ['src/lib/client-image-upload.ts'], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'PhotoPreparation', tsconfig: 'tsconfig.json' });
  await page.route('**/photo-budget-harness', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Photo budget</title>' }));
  await page.goto('/photo-budget-harness');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const api = (window as unknown as { PhotoPreparation: { prepareImageForUpload: (file: File, options: object) => Promise<File>; PROFILE_IMAGE_OPTIONS: object; PUBLIC_IMAGE_OPTIONS: object } }).PhotoPreparation;
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1200;
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    let seed = 123;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255; pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    const original = new File([blob], 'camera.png', { type: 'image/png' });
    const output = await api.prepareImageForUpload(original, api.PROFILE_IMAGE_OPTIONS);
    const bitmap = await createImageBitmap(output);
    const dimensions = [bitmap.width, bitmap.height]; bitmap.close();
    const publicOutput = await api.prepareImageForUpload(original, api.PUBLIC_IMAGE_OPTIONS);
    const publicBitmap = await createImageBitmap(publicOutput);
    const publicDimensions = [publicBitmap.width, publicBitmap.height]; publicBitmap.close();
    canvas.width = 32; canvas.height = 32;
    const small = new File([await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))], 'small.png', { type: 'image/png' });
    return { originalBytes: original.size, bytes: output.size, dimensions, publicBytes: publicOutput.size, publicDimensions, unchanged: await api.prepareImageForUpload(small, api.PROFILE_IMAGE_OPTIONS) === small };
  });
  expect(result.originalBytes).toBeGreaterThan(1024 * 1024);
  expect(result.bytes).toBeLessThanOrEqual(150 * 1024);
  expect(Math.max(...result.dimensions)).toBeLessThanOrEqual(800);
  expect(result.dimensions[0] / result.dimensions[1]).toBeCloseTo(4 / 3, 2);
  expect(result.publicBytes).toBeLessThanOrEqual(512 * 1024);
  expect(Math.max(...result.publicDimensions)).toBeLessThanOrEqual(1600);
  expect(result.publicDimensions[0] / result.publicDimensions[1]).toBeCloseTo(4 / 3, 2);
  expect(result.unchanged).toBe(true);
});

test('migration photos remain transparent when needed and render in Open Graph cards', async () => {
  const sharp = (await import('sharp')).default;
  const { cardCompatibleImage } = await import('../../scripts/lib/card-compatible-image.mjs');
  const { ImageResponse } = await import('next/og.js');
  const { createElement } = await import('react');
  const source = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 25, g: 95, b: 185 } } }).webp().toBuffer();
  const converted = await cardCompatibleImage(source, { maxDimension: 800, targetBytes: 150 * 1024 });
  expect(converted.contentType).toBe('image/jpeg');
  expect(converted.body.length).toBeLessThanOrEqual(150 * 1024);
  const dimensions = await sharp(converted.body).metadata();
  expect([dimensions.width, dimensions.height]).toEqual([800, 600]);
  const card = new ImageResponse(createElement('div', { style: { display: 'flex', width: 80, height: 80 } },
    createElement('img', { src: `data:${converted.contentType};base64,${converted.body.toString('base64')}`, width: 80, height: 80 })), { width: 80, height: 80 });
  const pixels = await sharp(Buffer.from(await card.arrayBuffer())).stats();
  expect(pixels.channels[2].mean).toBeGreaterThan(150);
  expect(pixels.channels[0].mean).toBeLessThan(60);

  const transparent = await sharp({ create: { width: 900, height: 600, channels: 4, background: { r: 25, g: 95, b: 185, alpha: 0.4 } } }).webp().toBuffer();
  const logo = await cardCompatibleImage(transparent, { maxDimension: 800, targetBytes: 150 * 1024 });
  expect(logo.contentType).toBe('image/png');
  expect((await sharp(logo.body).metadata()).hasAlpha).toBe(true);
  expect(logo.body.length).toBeLessThanOrEqual(150 * 1024);
});
