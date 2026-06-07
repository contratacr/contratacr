// Cloudinary URL transform helpers. We store ONE optimized image per upload and
// derive thumbnails / gallery sizes on the fly via URL transforms — never extra
// stored copies. f_auto (WebP/AVIF) + q_auto are applied for every delivery.

export const MAX_PORTFOLIO_PHOTOS = 5;

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
