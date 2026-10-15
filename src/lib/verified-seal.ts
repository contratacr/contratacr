/** Shared geometry for the UI, map HTML and exported QR cards. */
export const VERIFIED_SEAL_PATH = "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z";
export const VERIFIED_CHECK_PATH = "m9 12 2 2 4-4";
export const VERIFIED_SEAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="${VERIFIED_SEAL_PATH}" fill="#009FD9"/><path d="${VERIFIED_CHECK_PATH}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const VERIFIED_SEAL_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(VERIFIED_SEAL_SVG)}`;
