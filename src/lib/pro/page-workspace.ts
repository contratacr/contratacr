import 'server-only';
import {cookies} from 'next/headers';
import type {createAdminClient} from '@/lib/supabase/admin';
import {PRO_WS_COOKIE} from './workspace-gate';

/**
 * Gaps round (2026-11-17): effective workspace of a Pro PAGE (server component) — the API routes get it from the
 * signed middleware gate; pages outside /api read the same company cookie chosen in Equipo and re-check it in SQL
 * (pro_team_workspace_resolve: active member of that owner's company with Pro tools on). Without a valid cookie the
 * person works in their own workspace. `member` is the person when they work in someone else's company.
 */
export type ProPageWorkspace={actor:string;member:string|null;role:string};
export async function proPageWorkspace(db:ReturnType<typeof createAdminClient>,userId:string):Promise<ProPageWorkspace>{
 const owner=(await cookies()).get(PRO_WS_COOKIE)?.value;
 if(!owner||owner===userId||!/^[0-9a-f-]{36}$/i.test(owner))return {actor:userId,member:null,role:'owner'};
 const ws=await db.rpc('pro_team_workspace_resolve',{p_member:userId,p_owner:owner});
 const data=ws.data as {ownerId?:string;role?:string}|null;
 if(ws.error||!data||data.ownerId!==owner||typeof data.role!=='string')return {actor:userId,member:null,role:'owner'};
 return {actor:owner,member:userId,role:data.role};
}
