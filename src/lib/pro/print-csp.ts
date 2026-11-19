/**
 * Fix 13 (security review #1): the Next header table (next.config.ts) replaces route response headers with the
 * global `frame-ancestors 'self'` except for a fixed list of private print/file routes. For the newer print
 * routes the middleware issues the per-response nonce and sets the SAME strict policy the route builds
 * (it wins over the global table), and the route uses that nonce for its print button. Edge-safe.
 */
export const PRINT_NONCE_HEADER='x-ccr-print-nonce';
export const MIDDLEWARE_PRINT_ROUTES=/^\/api\/pro\/(?:quote-print|work-changes-print|selections-print|contract-print|payment-plan-print|purchase-order-print|client-statement-print)\/?$/;
export const printContentPolicy=(nonce:string)=>`default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
export const newPrintNonce=()=>crypto.randomUUID().replaceAll('-','');
/** The nonce the middleware issued for this request (only its own 32-hex format), else a fresh one. */
export function printNonce(req:Request){const value=req.headers.get(PRINT_NONCE_HEADER);return value&&/^[a-f0-9]{32}$/.test(value)?value:newPrintNonce();}
