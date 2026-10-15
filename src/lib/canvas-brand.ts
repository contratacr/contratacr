/** Draw the approved navbar artwork, cropped only to its visible outer bounds. */
export async function drawCanvasBrand(ctx: CanvasRenderingContext2D, x: number, centerY: number, width: number) {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not load brand asset')); img.src = src;
  });
  const [mark, wordmark] = await Promise.all([load('/logo-mark-transparent.png'), load('/brand/wordmark-light.svg')]);
  // Same proportions and zero added gap as ContrataCRLogo. Remove transparent
  // outer padding so the visible mark aligns with the document's text column.
  const artwork = document.createElement('canvas'); artwork.width = 548; artwork.height = 128;
  const drawing = artwork.getContext('2d'); if (!drawing) return;
  drawing.drawImage(mark, 0, 0, 128, 128); drawing.drawImage(wordmark, 128, 16, 420, 96);
  const pixels = drawing.getImageData(0, 0, artwork.width, artwork.height).data;
  let left = artwork.width, top = artwork.height, right = 0, bottom = 0;
  for (let y = 0; y < artwork.height; y++) for (let x = 0; x < artwork.width; x++) {
    if (pixels[(y * artwork.width + x) * 4 + 3] > 0) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  const sourceWidth = right - left + 1, sourceHeight = bottom - top + 1;
  const height = width * sourceHeight / sourceWidth;
  ctx.drawImage(artwork, left, top, sourceWidth, sourceHeight, x, centerY - height / 2, width, height);
}
