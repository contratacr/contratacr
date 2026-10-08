

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
