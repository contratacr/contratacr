import {enforceRateLimit} from '@/lib/rate-limit';
import {businessContext,businessPlaces,businessSections} from '@/lib/directory/business-access';
import {dirEnabledOnly,dirOk} from '@/lib/directory/public-route';

// Launch without Pro (2026-11-18): GET /api/negocio → {places, sections} of «Mi negocio»: the claimed places the
// signed-in account manages (owner or manager) and which tools apply. Free; no Pro, no edition. Read-only.
export async function GET(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 const c=await businessContext(req);if(c.error)return c.error;
 // Per account (plus IP), not per IP alone: the account menu calls this on every page load of every signed-in user, so a shared IP
 // (carrier NAT, an office, a family) would exhaust a per-IP bucket and hide «Mi negocio» for everyone behind it.
 const limited=await enforceRateLimit(req,'dir-business-hub-'+c.ctx.actor,60,60_000);if(limited)return limited;
 const places=await businessPlaces(c.ctx.db,c.ctx.actor);
 return dirOk({places,sections:businessSections(places)});
}
