import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeGetUser } from '@/lib/supabase/get-user';
import { requireAdmin } from '@/lib/auth/admin';
import { cookies } from 'next/headers';
import { hasProAccess, proBannedFlag } from './access';
import { PRO_WS_COOKIE } from './workspace-gate';
export async function requirePro(options?:{returnTo:string;locale:string}) {
 const user = await safeGetUser(await createClient());
 if (!user) redirect(options?(options.locale==='en'?'/en':'')+'/login?redirect='+encodeURIComponent(options.returnTo):'/login');
 const deniedTarget=options?(options.locale==='en'?'/en':'')+'/dashboard/profesional?tab=home':'/dashboard';
 const db = createAdminClient();
 const [{ data: profile, error }, banned] = await Promise.all([db.from('profiles').select('role,is_disabled,is_provider').eq('id', user.id).maybeSingle(), proBannedFlag(db, user.id)]);
 // Mirrors SQL pro_entitled: a banned/suspended professional (or an unreadable ban flag) never enters Pro, admin included.
 if (error || !profile || profile.is_disabled || banned !== false) redirect(deniedTarget);
 if (profile.role === 'admin') { await requireAdmin(); return user; }
 // Round 7C: a company team member working in an owner's company (cookie chosen in Equipo) enters
 // that company's Pro space as the owner's workspace; its role is enforced on every /api/pro request.
 const workspace = (await cookies()).get(PRO_WS_COOKIE)?.value;
 if (workspace && workspace !== user.id) {
  const { data: ws, error: wsError } = await db.rpc('pro_team_workspace_resolve', { p_member: user.id, p_owner: workspace });
  if (!wsError && ws && typeof ws === 'object' && (ws as {ownerId?:string}).ownerId === workspace) return { ...user, id: workspace };
 }
 const { data: grant, error: grantError } = await db.from('pro_memberships').select('status,expires_at').eq('user_id', user.id).maybeSingle();
 if (grantError || !hasProAccess(profile, grant, banned)) redirect(deniedTarget);
 return user;
}
