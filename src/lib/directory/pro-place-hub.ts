import 'server-only';
import {proHasModule} from '@/lib/pro/api-access-module';
import {managedPlaces,type ProPlaceContext} from './pro-place-route';
import type {ProPlaceHub} from '@/lib/pro/hub-sections';

// LOCAL PRO ONLY (pending fixes round, 2026-11-17): which directory modules the Pro hub shows for this workspace.
// Visible only when the effective account (the owner's, for a company member) actively manages a CLAIMED place:
//  - «Menú» and «Reservas de mesa»: a claimed restaurant/café AND the module (menu / table_reservations) is active;
//  - «Mi lugar» (events, «Pedir», brand info): any claimed place except bank/ATM map points.
// Gaps round (2026-11-17): «Menú» is listed for company members whose role allows menu.write (admin, manager, member) —
// /dashboard/pro/menu edits the WORKSPACE's places; read_only members do not see it.
// Routes and SQL still enforce every permission; this only decides which entries are listed.
/** Whether the company member's role in the owner's company allows a capability (SQL pro_role_of + pro_role_allows). */
export async function memberCan(db:ProPlaceContext['db'],member:string,owner:string,capability:string){
 const role=await db.rpc('pro_role_of',{p_actor:member,p_owner:owner});
 if(role.error||typeof role.data!=='string')return false;
 const allowed=await db.rpc('pro_role_allows',{p_role:role.data,p_capability:capability});
 return !allowed.error&&allowed.data===true;
}
const DINING=['restaurant','cafe_bar'] as const;
export async function proPlaceHubState(db:ProPlaceContext['db'],actor:string,member:string|null):Promise<ProPlaceHub>{
 const places=await managedPlaces(db,actor);
 const dining=places.some(p=>(DINING as readonly string[]).includes(p.vertical));
 const [menu,reservations]=dining?await Promise.all([proHasModule(db,actor,'menu'),proHasModule(db,actor,'table_reservations')]):[false,false];
 return {menu:menu&&(!member||await memberCan(db,member,actor,'menu.write')),reservations,place:places.some(p=>p.vertical!=='banking')};
}
