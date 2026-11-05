import { createClient } from "@/lib/supabase/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

async function scopedAdmin(scope:"moderation"|"support"|"identity_review") {
  const admin=await getApiAdmin(); if(!admin)return null;
  const {data,error}=await createAdminClient().from("admin_staff_permissions").select("moderation,support,identity_review").eq("user_id",admin.id).maybeSingle();
  return !error && data?.[scope]===true ? admin:null;
}
export const getModerationAdmin=()=>scopedAdmin("moderation");
export const getSupportAdmin=()=>scopedAdmin("support");
export const getIdentityAdmin=()=>scopedAdmin("identity_review");

export async function moderationAccess() {
  const admin = await getApiAdmin();
  if (!admin) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("admin_can_moderate");
  return !error && data === true ? { admin, db } : null;
}

export const privateHeaders = { "Cache-Control": "private, no-store", "Pragma": "no-cache" };
