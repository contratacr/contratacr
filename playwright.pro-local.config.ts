import base from './playwright.config';
import {defineConfig} from 'playwright/test';
import {randomUUID} from 'node:crypto';
// This suite creates its own disposable actors and only targets loopback Supabase.
// Rate limits live in Postgres (src/lib/rate-limit.ts), so counters survive dev-server restarts. Each Playwright run
// sends its own bucket namespace; `next dev` honours it (production ignores the header), so a re-run never inherits
// the previous run's counters. It does not skip any limit: specs that assert a 429 still reach it within their run.
const rateLimitNamespace='pw-'+randomUUID();
export default defineConfig({...base,globalSetup:undefined,testMatch:'**/pro-*.spec.ts',testIgnore:['**/.tmp-*.spec.ts'],workers:1,
 use:{...base.use,extraHTTPHeaders:{...(base.use?.extraHTTPHeaders??{}),'x-ccr-rate-limit-namespace':rateLimitNamespace}}});
