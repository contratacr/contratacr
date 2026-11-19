import {createHash} from 'node:crypto';

/**
 * Server secrets that must be configured in production (names only; values live in the deployment's secret store):
 * DIR_CLAIM_OTP_PEPPER, DIR_VISITOR_PEPPER, PRO_BID_PORTAL_SECRET. See docs/pro/required-env.md.
 *
 * Production (NODE_ENV=production, which includes the Cloudflare Workers build): a missing, short or local-dev value
 * is refused. The caller answers 503 and never generates a random replacement (a random per-isolate value would make
 * codes, guest-review contacts and portal links fail at random on Workers).
 *
 * Development only: a DETERMINISTIC, PUBLIC, NOT-SECRET fallback = sha256hex('contratacr-local-dev-only:' + NAME).
 * scripts/dev-local-test-env.js injects the same value, so codes and links survive dev-server restarts.
 */
export type RequiredServerSecret='DIR_CLAIM_OTP_PEPPER'|'DIR_VISITOR_PEPPER'|'PRO_BID_PORTAL_SECRET';
export const LOCAL_DEV_SECRET_PREFIX='contratacr-local-dev-only:';
export const localDevSecret=(name:RequiredServerSecret)=>createHash('sha256').update(LOCAL_DEV_SECRET_PREFIX+name,'utf8').digest('hex');
const isProduction=()=>process.env.NODE_ENV==='production';
const reported=new Set<string>();
function report(name:string,problem:string){
 if(reported.has(name))return;reported.add(name);
 console.error(`[config] ${name} ${problem}: the feature that needs it answers 503 until it is set in the server environment (see docs/pro/required-env.md).`);
}
/**
 * Value of a required server secret, or null (caller fails closed). Never random. `minLength` is the minimum
 * character length of the raw value.
 */
export function requiredServerSecret(name:RequiredServerSecret,minLength=32):string|null{
 const value=process.env[name]?.trim()??'';
 if(isProduction()){
  if(!value||value.length<minLength){report(name,'is missing or too short in production');return null;}
  if(value===localDevSecret(name)||value.startsWith(LOCAL_DEV_SECRET_PREFIX)){report(name,'uses the public local-development value in production');return null;}
  return value;
 }
 if(value.length>=minLength)return value;
 if(process.env.NODE_ENV==='development')return localDevSecret(name);
 return null;
}
