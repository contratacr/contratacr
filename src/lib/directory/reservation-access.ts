import {rutaConIdioma} from '../prefijo-de-idioma';
import 'server-only';
import {createHash} from 'node:crypto';
import {dirPepper,hmacHex} from '@/lib/directory/public-route';
import {RESERVATION_TOKEN_RE} from '@/lib/directory/place-features';

// LOCAL PRO ONLY (pending fixes round, 2026-11-17): private link of a table reservation, /reserva/<token>.
// token = base64url(HMAC-SHA256(DIR_VISITOR_PEPPER, 'reservation-access:v1:' + reservationId)): 256 unguessable bits, no
// id inside, and the same for every retry of one request (so an idempotent replay still hands back the same link).
// The database stores only SHA-256(token) (dir_reservations.access_hash) and never the token itself.
const toB64url=(hex:string)=>Buffer.from(hex,'hex').toString('base64url');
export async function reservationAccessToken(reservationId:string):Promise<string|null>{
 const pepper=dirPepper('DIR_VISITOR_PEPPER');if(!pepper)return null;
 return toB64url(await hmacHex(pepper,'reservation-access:v1:'+reservationId));
}
export function reservationAccessHash(token:string):string|null{
 return RESERVATION_TOKEN_RE.test(token)?createHash('sha256').update(token,'utf8').digest('hex'):null;
}
export const reservationLink=(token:string,locale:string)=>rutaConIdioma(locale,`/reserva/${token}`);
