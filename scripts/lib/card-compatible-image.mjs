import sharp from 'sharp';

// Open Graph's Satori renderer accepts JPEG/PNG, not WebP/AVIF. Optimize
// migration outputs for both browser delivery and the existing share cards.
export async function cardCompatibleImage(input, { maxDimension, targetBytes }) {
  const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  if ((metadata.pages ?? 1) > 1) throw new Error('Animated source must be retained unchanged.');
  if (['jpeg', 'png'].includes(metadata.format) && input.length <= targetBytes && Math.max(metadata.width, metadata.height) <= maxDimension) {
    return { body: input, format: metadata.format === 'jpeg' ? 'jpg' : 'png', contentType: `image/${metadata.format}` };
  }
  const format = metadata.hasAlpha ? 'png' : 'jpg';
  const widths = [...new Set([maxDimension, 1200, 800, 600, 400, 256, 128].filter(width => width <= maxDimension))];
  for (const width of widths) {
    const image = sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true });
    const body = await (format === 'png' ? image.png({ compressionLevel: 9 }) : image.jpeg({ quality: 82, mozjpeg: true })).toBuffer();
    if (body.length <= targetBytes) return { body, format, contentType: format === 'jpg' ? 'image/jpeg' : 'image/png' };
  }
  throw new Error('Card-compatible image exceeds the requested budget.');
}
