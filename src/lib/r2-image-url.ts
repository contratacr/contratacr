import { cldLarge, cldThumb } from "./cloudinary";

/**
 * Sized URLs for uploaded photos (storage plan 2026-11-26, docs/storage-plan.md). Client-safe: no Node imports.
 *
 * Photos uploaded with a browser-made thumbnail are stored as a PAIR in R2 (or, locally, in the loopback
 * Supabase bucket) and the database keeps the URL of the large file only:
 *   <base>.lg.<ext>    large (profile 800 px JPEG, portfolio 1600 px WebP)
 *   <base>.sm.webp     400 px thumbnail          (.lg-j.<ext> → .sm.jpg when the browser could not encode WebP)
 * Only URLs carrying that marker are rewritten: older R2 objects and the legacy-cloudinary copies have no
 * sibling thumbnail, so they are served as they are. Cloudinary URLs keep their URL transforms (cldThumb/cldLarge).
 */
export const R2_THUMB_SIZE = 400;

export type PairMainExt = "webp" | "jpg" | "png";
export type PairThumbExt = "webp" | "jpg";

const PAIR = /\.lg(-j)?\.(webp|jpg|png)$/;

/** Object keys of a stored pair, from a base key without extension. */
export function pairedKeys(base: string, mainExt: PairMainExt, thumbExt: PairThumbExt) {
  return {
    main: `${base}.lg${thumbExt === "jpg" ? "-j" : ""}.${mainExt}`,
    thumb: `${base}.sm.${thumbExt}`,
  };
}

/** The thumbnail URL of a paired large URL; null when the URL has no stored thumbnail. */
export function r2ThumbUrl(url: string): string | null {
  const cut = url.search(/[?#]/);
  const path = cut < 0 ? url : url.slice(0, cut);
  const rest = cut < 0 ? "" : url.slice(cut);
  const match = PAIR.exec(path);
  if (!match) return null;
  return `${path.slice(0, match.index)}.sm.${match[1] ? "jpg" : "webp"}${rest}`;
}

const isCloudinary = (url: string) => url.startsWith("https://res.cloudinary.com/");

/**
 * Square-ish card/avatar image of `size` CSS px. Cloudinary → cldThumb transform; a paired R2 photo → its 400 px
 * thumbnail when `size` ≤ 400; anything else unchanged. Idempotent (a thumbnail URL is returned as is).
 */
export function r2Thumb(url: string, size = R2_THUMB_SIZE): string {
  if (!url) return url;
  if (isCloudinary(url)) return cldThumb(url, size);
  if (size <= R2_THUMB_SIZE) return r2ThumbUrl(url) ?? url;
  return url;
}

/** Gallery/lightbox image bounded by `max`. Cloudinary → cldLarge; R2/legacy → the stored large file. */
export function r2Large(url: string, max = 1280): string {
  if (!url) return url;
  return isCloudinary(url) ? cldLarge(url, max) : url;
}
