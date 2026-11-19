import {enforceRateLimit} from '@/lib/rate-limit';
import {proPlaceContext} from '@/lib/directory/pro-place-route';
import {proPlaceHubState} from '@/lib/directory/pro-place-hub';
import {dirOk} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (pending fixes round, development only): GET /api/pro/place-hub → {menu, reservations, place}, the
// directory entries the Pro hub shows («Menú», «Reservas de mesa», «Mi lugar»). Read-only (any team role can read: the
// gate maps GET to «read»). An account without Pro, or without claimed places, answers all false (never an error the
// hub has to show).
const NONE={menu:false,reservations:false,place:false};
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404});
 const limited=await enforceRateLimit(req,'pro-place-hub',60,60_000);if(limited)return limited;
 const c=await proPlaceContext(req);
 if(c.error)return c.error.status===403?dirOk(NONE):c.error;
 const {db,actor,member}=c.ctx;
 return dirOk(await proPlaceHubState(db,actor,member));
}
