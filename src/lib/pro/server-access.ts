import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeGetUser } from '@/lib/supabase/get-user';
import { requireAdmin } from '@/lib/auth/admin';
import { hasProAccess } from './access';
export async function requirePro() {
 const user = await safeGetUser(await createClient());
 if (!user) redirect('/login');
 const db = createAdminClient();
 const { data: profile, error } = await db.from('profiles').select('role,is_disabled,is_provider').eq('id', user.id).maybeSingle();
 if (error || !profile || profile.is_disabled) redirect('/dashboard');
 if (profile.role === 'admin') { await requireAdmin(); return user; }
 const { data: grant, error: grantError } = await db.from('pro_memberships').select('status,expires_at').eq('user_id', user.id).maybeSingle();
 if (grantError || !hasProAccess(profile, grant)) redirect('/dashboard');
 return user;
}
