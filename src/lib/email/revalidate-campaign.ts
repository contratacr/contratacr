import { MOBILE_APP_CAMPAIGN } from "./mobile-app-campaign";
import type { CampaignHistory } from "./campaign-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { lifecycleCandidate, type LifecycleAccount, type LifecycleProfessional } from "./lifecycle-policy";

/** Deferred emails are evaluated again immediately before dispatch. Completing
 * a profile, adding a review, installing the app or opting out cancels stale copy. */
export async function queuedCampaignEligible(email: string, campaign: string): Promise<boolean | null> {
  if (campaign === MOBILE_APP_CAMPAIGN.key) return false; // Retired, including old queued envelopes.
  const db = createAdminClient();
  const account = await db.from("profiles").select("id,email,full_name,created_at,is_disabled,role,is_provider,avatar_url").ilike("email", email).maybeSingle();
  if (account.error) return null;
  if (!account.data) return false;
  const userId = account.data.id;
  const [pro,history,bajas,projects,auth,mobile] = await Promise.all([
    db.from("professionals").select("*").eq("profile_id",userId).maybeSingle(),
    db.from("admin_campaign_sends").select("profile_id,email,campana,status,enviado_en,rebote_en").eq("profile_id",userId).neq("campana",campaign),
    db.from("email_bajas").select("correo").ilike("correo",email),
    db.from("projects").select("id").eq("client_id",userId).limit(1),
    db.auth.admin.getUserById(userId),
    campaign === "descargar-app-2026" ? db.rpc("has_used_mobile_app",{p_user_id:userId}) : Promise.resolve({data:false,error:null}),
  ]);
  if ([pro,history,bajas,projects,auth,mobile].some(row=>row.error)) return null;
  const user = auth.data.user;
  const current = lifecycleCandidate({...account.data,
    professionalIntent:user?.user_metadata?.intended_role === "professional" || user?.user_metadata?.professional_signup_started === true,
    emailConfirmed:Boolean(user?.email_confirmed_at), hasUsedMobileApp:mobile.data === true,
  } as LifecycleAccount, pro.data as LifecycleProfessional | undefined,history.data as CampaignHistory[],
  (bajas.data ?? []).map(row=>row.correo),Boolean(projects.data?.length));
  return current?.key === campaign;
}

export async function queuedActivityEligible(eventKey: string): Promise<boolean | null> {
  const [kind, id, messageId, recipientId] = eventKey.split(":");
  const db = createAdminClient();
  if (kind === "aviso-proyecto" || kind === "aviso-empleo") {
    const { data, error } = await db.from(kind === "aviso-proyecto" ? "projects" : "job_posts").select("status").eq("id",id).maybeSingle();
    return error ? null : data?.status === (kind === "aviso-proyecto" ? "open" : "published");
  }
  if (kind === "chat") {
    const [conversation,message] = await Promise.all([
      db.from("direct_conversations").select("status,client_id,professional_profile_id,client_unread_count,professional_unread_count,client_deleted_at,professional_deleted_at").eq("id",id).maybeSingle(),
      db.from("direct_messages").select("deleted_at,edited_at").eq("id",messageId).eq("conversation_id",id).maybeSingle(),
    ]);
    if (conversation.error || message.error) return null;
    const thread = conversation.data;
    if (!thread || thread.status !== "open" || !message.data || message.data.deleted_at || message.data.edited_at) return false;
    if (recipientId === thread.client_id) return !thread.client_deleted_at && Number(thread.client_unread_count)>0;
    if (recipientId === thread.professional_profile_id) return !thread.professional_deleted_at && Number(thread.professional_unread_count)>0;
    return false;
  }
  return true;
}
