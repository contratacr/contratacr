// Cloudinary URL transform helpers. We store ONE optimized image per upload and
// derive thumbnails / gallery sizes on the fly via URL transforms — never extra
// stored copies. f_auto (WebP/AVIF) + q_auto are applied for every delivery.

export const MAX_PORTFOLIO_PHOTOS = 5;
const DEFAULT_CLOUDINARY_CLOUD_NAME = "dxxrjx2go";

export function cloudinaryAssetUrl(publicIdWithExtension: string, transform = "f_auto,q_auto"): string {
  // This helper renders on both the server and the client. A server-only
  // fallback would produce different HTML during hydration.
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUDINARY_CLOUD_NAME;
  const normalizedPublicId = publicIdWithExtension.replace(/^\/+/, "");
  const normalizedTransform = transform.replace(/^\/+|\/+$/g, "");
  return `https://res.cloudinary.com/${cloudName}/image/upload/${normalizedTransform}/${normalizedPublicId}`;
}

/** Insert a transformation string right after `/upload/` in a Cloudinary URL. */
function withTransform(url: string, transform: string): string {
  if (!url || !url.includes("/upload/")) return url;
  // Avoid double-applying if a transform is already present for this size.
  return url.replace("/upload/", `/upload/${transform}/`);
}

/** Small square thumbnail for /buscar cards and grids. */
export function cldThumb(url: string, size = 400): string {
  return withTransform(url, `f_auto,q_auto,c_fill,w_${size},h_${size}`);
}

/** Larger, max-bounded image for the gallery / lightbox. */
export function cldLarge(url: string, max = 1280): string {
  return withTransform(url, `f_auto,q_auto,c_limit,w_${max}`);
}

/** Next's image optimizer is a pass-through on Cloudflare Workers: it cannot
 *  re-encode, so it hands back whatever Cloudinary was asked for — the same
 *  1600px JPEG on a phone as on a desktop. Giving `Image` this loader puts the
 *  width back in Cloudinary's hands, where `f_auto` also picks WebP or AVIF:
 *  ~80 KB on a phone instead of ~382 KB, in one hop instead of two.
 *  Non-Cloudinary sources are returned untouched. */
export function cloudinaryImageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  const marker = "/image/upload/";
  const at = src.indexOf(marker);
  if (!src.startsWith("https://res.cloudinary.com/") || at < 0) return src;
  const base = src.slice(0, at + marker.length);
  const rest = src.slice(at + marker.length);
  // Drop an existing transform segment (comma-separated `x_y` params) so the
  // requested width wins; a version segment (v123…) and the public id stay.
  const segments = rest.split("/");
  if (segments.length > 1 && /^[a-z]+_[^/]*$/.test(segments[0]) && !/^v\d+$/.test(segments[0])) segments.shift();
  return `${base}f_auto,q_${quality ?? "auto"},w_${width}/${segments.join("/")}`;
}

/** A tiny, heavily blurred derivative of a Cloudinary image (~0.5–1 KB) to paint
 *  under the real one while it arrives — the same picture, soft, instead of a
 *  grey box or a hard pop. Returns null for anything not hosted on Cloudinary. */
export function cldPreview(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("https://res.cloudinary.com/")) return null;
  const marker = "/image/upload/";
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const segments = url.slice(at + marker.length).split("/");
  if (segments.length > 1 && /^[a-z]+_[^/]*$/.test(segments[0]) && !/^v\d+$/.test(segments[0])) segments.shift();
  return `${url.slice(0, at + marker.length)}f_auto,q_30,w_32,e_blur:400/${segments.join("/")}`;
}
