import { MOBILE_APP_CAMPAIGN } from "./mobile-app-campaign";
import type { createAdminClient } from "@/lib/supabase/admin";
import { LIFECYCLE_CAMPAIGNS, lifecycleCandidate, type LifecycleAccount, type LifecycleProfessional } from "./lifecycle-policy";
import type { CampaignHistory } from "./campaign-policy";
import { deliverCampaignOnce } from "./campaign-delivery";
import { brandedEmailDocument, sendBrevoEmail } from "./send";
import { enlaceDeBaja } from "./baja";
import { escaparHtml } from "./escape";
import { resumenDeCuota } from "./cuota";
type Admin = ReturnType<typeof createAdminClient>;
const ACCOUNT_FIELDS = "id,email,full_name,created_at,is_disabled,role,is_provider,avatar_url";
const PRO_FIELDS = "profile_id,created_at,review_count,services,is_banned,oculto_del_buscador,slug,bio,whatsapp,workplaces,coverage_areas,coverage_provincias,coverage_country,provincia_id,canton_id";
function signupSignals(user: {user_metadata?: Record<string,unknown>;email_confirmed_at?: string} | null) {
  return {professionalIntent:user?.user_metadata?.intended_role === "professional" || user?.user_metadata?.professional_signup_started === true,
    emailConfirmed:Boolean(user?.email_confirmed_at)};
}
async function signupSignalsByAccount(db: Admin) {
  const signals = new Map<string,ReturnType<typeof signupSignals>>();
  for (let page=1; ; page++) {
    const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});
    if (error) throw error;
    for (const user of data.users) signals.set(user.id,signupSignals(user));
    if (data.users.length < 1000) return signals;
  }
}
async function mobileUsageAccounts(db: Admin): Promise<Set<string> | undefined> {
  try {
    // SQL returns distinct accounts, includes historical evidence, and paginates
    // beyond PostgREST's default 1,000 row limit.
    const rows = await all<{user_id:string}>((a,b) => db.rpc("get_mobile_usage_accounts").order("user_id").range(a,b));
    return new Set(rows.map(row => row.user_id));
  } catch { return undefined; }
}
async function all<T>(query: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await query(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}
export async function runLifecycleEmails(db: Admin, simulate = true) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
  if (!simulate && !["contratacr.com","www.contratacr.com"].includes(new URL(origin).hostname))
    throw new Error("Automatic email delivery is production-only");
  const [accounts, professionals, history, bajas, projects, signup, mobileUsers] = await Promise.all([
    all<LifecycleAccount>((a,b) => db.from("profiles").select(ACCOUNT_FIELDS).eq("is_disabled",false).order("created_at").order("id").range(a,b)),
    all<LifecycleProfessional>((a,b) => db.from("professionals").select(PRO_FIELDS).order("id").range(a,b)),
    all<CampaignHistory>((a,b) => db.from("admin_campaign_sends").select("profile_id,email,campana,status,enviado_en,rebote_en").order("id").range(a,b)),
    all<{correo:string}>((a,b) => db.from("email_bajas").select("correo").order("correo").range(a,b)),
    all<{client_id:string}>((a,b) => db.from("projects").select("client_id").order("id").range(a,b)),
    signupSignalsByAccount(db),
    mobileUsageAccounts(db),
  ]);
  const proByAccount = new Map(professionals.map((p) => [p.profile_id,p]));
  const projectOwners = new Set(projects.map((p) => p.client_id));
  const blocked = bajas.map((b) => b.correo);
  const counts: Record<string,number> = {};
  const candidates = accounts.flatMap((account) => {
    const campaign = lifecycleCandidate({...account,...signup.get(account.id),hasUsedMobileApp:mobileUsers?.has(account.id)},proByAccount.get(account.id),history,blocked,projectOwners.has(account.id));
    if (!campaign) return [];
    counts[campaign.key] = (counts[campaign.key] ?? 0) + 1;
    return [{ account, campaign }];
  });
  // Finish missing professional steps before consuming the quota on general tips.
  candidates.sort((a,b) => LIFECYCLE_CAMPAIGNS.findIndex((c) => c.key === a.campaign.key)
    - LIFECYCLE_CAMPAIGNS.findIndex((c) => c.key === b.campaign.key));
  if (simulate) return { simulate:true, eligible:counts, sent:0, mobileUsageVerified:mobileUsers !== undefined };
  let sent = 0, uncertain = 0, skipped = 0, queued = 0;
  const delivered: Record<string,number> = {};
  for (const {account,campaign} of candidates.slice(0,250)) {
    if (!(await resumenDeCuota()).puedeEnviar.masivo) break;
    const result = await deliverCampaignOnce(db,campaign.key,account.email!,async () => {
      // Recheck role, completed steps, opt-out and history immediately before delivery.
      const [a,p,h,b,j,auth,mobile] = await Promise.all([
        db.from("profiles").select(ACCOUNT_FIELDS).eq("id",account.id).single(),
        db.from("professionals").select(PRO_FIELDS).eq("profile_id",account.id).maybeSingle(),
        db.from("admin_campaign_sends").select("profile_id,email,campana,status,enviado_en,rebote_en").eq("profile_id",account.id).neq("campana",campaign.key),
        db.from("email_bajas").select("correo").ilike("correo",account.email!),
        db.from("projects").select("client_id").eq("client_id",account.id).limit(1),
        db.auth.admin.getUserById(account.id),
        campaign.key === MOBILE_APP_CAMPAIGN.key
          ? db.rpc("has_used_mobile_app",{p_user_id:account.id})
          : Promise.resolve({data:mobileUsers?.has(account.id),error:null}),
      ]);
      if (!a.data || [a,p,h,b,j,auth,mobile].some((r) => r.error))
        return {ok:false,status:"skipped" as const,detail:"Cannot verify recipient before delivery"};
      const current = lifecycleCandidate({...a.data,...signupSignals(auth.data.user),hasUsedMobileApp:mobile.data === true ? true : mobile.data === false ? false : undefined} as LifecycleAccount,p.data as LifecycleProfessional | undefined,
        h.data as CampaignHistory[],(b.data ?? []).map((r) => r.correo),Boolean(j.data?.length));
      if (!current || current.key !== campaign.key || a.data.email?.toLowerCase() !== account.email?.toLowerCase())
        return {ok:false,status:"skipped" as const,detail:"No longer eligible"};
      const href = new URL(campaign.ctaPath,origin);
      href.searchParams.set("utm_source","correo"); href.searchParams.set("utm_medium","campana"); href.searchParams.set("utm_campaign",campaign.key);
      const name = (account.full_name ?? "").trim().split(/\s+/)[0];
      const greeting = /^[\p{L}][\p{L}'-]{1,}$/u.test(name) ? `<p>Hola ${escaparHtml(name)},</p>` : campaign.key === MOBILE_APP_CAMPAIGN.key ? "<p>Hola,</p>" : "";
      const signature = campaign.key === MOBILE_APP_CAMPAIGN.key ? MOBILE_APP_CAMPAIGN.signature : "Equipo ContrataCR";
      const bodyHtml = greeting + campaign.body.split(/\n\n/).map((s) => `<p style="font-size:15px;line-height:1.6">${escaparHtml(s)}</p>`).join("")
        + `<p><a href="${escaparHtml(href)}" style="display:inline-block;background:#009FD9;color:white;padding:12px 22px;border-radius:24px;text-decoration:none">${escaparHtml(campaign.ctaLabel)}</a></p>`
        + `<p>${escaparHtml(signature)}</p><p><a href="${origin}/soporte">Soporte en ContrataCR</a></p>`
        + `<p style="font-size:12px">Recibes este correo porque tienes una cuenta en ContrataCR. <a href="${escaparHtml(enlaceDeBaja(origin,account.email!))}">No quiero recibir novedades</a>.</p>`;
      return sendBrevoEmail({to:account.email!,eventKey:`campaign:${campaign.key}:${account.email!.trim().toLowerCase()}`,subject:campaign.subject,nivel:"masivo",campana:campaign.key,
        html:brandedEmailDocument({title:campaign.subject,bodyHtml,origin})});
    },{coordinated:true});
    if (result === "sent") { sent++; delivered[campaign.key]=(delivered[campaign.key] ?? 0)+1; }
    else if (result === "queued") queued++; else if (result === "uncertain") uncertain++; else skipped++;
  }
  return {simulate:false,eligible:counts,sent,delivered,uncertain,skipped,queued};
}
