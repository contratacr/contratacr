import {safeGetUser} from '@/lib/pro/workspace-user';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getApiAdmin } from '@/lib/auth/admin';
import { hasProAccess, proBannedFlag } from './access';
import {PRO_ENABLED} from '@/lib/pro/enabled';
export async function proApiAccess(req: Request, adminOnly = false) {
 if (!PRO_ENABLED) return { error: Response.json({error:'No disponible'}, {status:404}) };
 // Next may rewrite req.url to its internal hostname; Host retains the browser origin.
 const expectedOrigin = `${new URL(req.url).protocol}//${req.headers.get('host') || new URL(req.url).host}`;
 if (req.method !== 'GET' && req.headers.get('origin') !== expectedOrigin) return { error: Response.json({error:'Origen no autorizado'}, {status:403}) };
 const user = await safeGetUser(await createClient());
 if (!user) return { error: Response.json({error:'Inicie sesión'}, {status:401}) };
 const db = createAdminClient();
 const [{data:profile,error},banned] = await Promise.all([db.from('profiles').select('role,is_disabled,is_provider').eq('id',user.id).maybeSingle(),proBannedFlag(db,user.id)]);
 // Mirrors SQL pro_entitled: a banned/suspended professional (or an unreadable ban flag) never reaches Pro, admin included.
 if (error || !profile || profile.is_disabled || banned!==false) return { error: Response.json({error:'Sin acceso'}, {status:403}) };
 const isAdmin = profile.role === 'admin' && Boolean(await getApiAdmin());
 if (adminOnly && !isAdmin || profile.role === 'admin' && !isAdmin) return { error: Response.json({error:'Se requiere acceso administrativo verificado'}, {status:403}) };
 if (!isAdmin) {
  const {data:grant,error:grantError}=await db.from('pro_memberships').select('status,expires_at').eq('user_id',user.id).maybeSingle();
  if(grantError || !hasProAccess(profile,grant,banned)) return { error: Response.json({error:'Se requiere Pro activo'}, {status:403}) };
 }
 return {user,db,isAdmin};
}
export function proDbFailure(error: {code?:string} | null) {
 return Response.json({error:error?.code==='40001'?'Los datos cambiaron. Recargue antes de guardar.':'No se pudo guardar. Revise la base local de Pro.'},{status:error?.code==='40001'?409:503});
}
