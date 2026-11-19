/**
 * Round 7C: one size limit for private Pro files (work files, daily log files, company files, task
 * files, expense receipts, bid portal files, catalog images): the global cap of the local storage
 * stack (supabase/config.toml file_size_limit = "20MiB"). Production target: 25 MB, which needs the
 * owner to raise the storage global limit first. Photos (JPG/PNG/WebP) are normalized to JPEG.
 */
export const PRO_FILE_MAX_BYTES=20*1024*1024;
export const PRO_FILE_MAX_MB=20;
/** One wording everywhere for what is accepted. */
export function proFileLimitText(en:boolean,pdf=true){return en?`JPG, PNG or WebP photos (PNG and WebP are saved as JPG)${pdf?' or PDF':''}, up to ${PRO_FILE_MAX_MB} MB.`:`Fotos JPG, PNG o WebP (PNG y WebP se guardan como JPG)${pdf?' o PDF':''}, de hasta ${PRO_FILE_MAX_MB} MB.`;}
/** Largest JSON upload body (base64 of the file + small metadata). */
export const PRO_FILE_BODY_MAX=Math.ceil(PRO_FILE_MAX_BYTES/3)*4+65536;
