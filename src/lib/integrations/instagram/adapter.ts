import {createMetaInstagramAdapter} from './meta';
import {createSandboxInstagramAdapter} from './sandbox';
import type {InstagramAdapter} from './types';

/**
 * Which Instagram adapter serves this request:
 *  - `meta` when INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and INSTAGRAM_REDIRECT_URI are all set (and INSTAGRAM_ADAPTER is not
 *    'sandbox');
 *  - `sandbox` only in local development (`next dev`): without the variables, or with INSTAGRAM_ADAPTER=sandbox;
 *  - null otherwise: a production build without the variables offers nothing (never fake photos).
 */
export function pickInstagramAdapter(env:Record<string,string|undefined>=process.env):InstagramAdapter|null{
 const dev=env.NODE_ENV==='development';
 const appId=env.INSTAGRAM_APP_ID?.trim(),appSecret=env.INSTAGRAM_APP_SECRET?.trim(),redirectUri=env.INSTAGRAM_REDIRECT_URI?.trim();
 if(dev&&env.INSTAGRAM_ADAPTER==='sandbox')return createSandboxInstagramAdapter();
 if(appId&&appSecret&&redirectUri&&/^https:\/\//.test(redirectUri))return createMetaInstagramAdapter({appId,appSecret,redirectUri});
 return dev?createSandboxInstagramAdapter():null;
}
