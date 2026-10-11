import type { createAdminClient } from "@/lib/supabase/admin";
import { LIFECYCLE_CAMPAIGNS, lifecycleCandidate, type LifecycleAccount, type LifecycleProfessional } from "./lifecycle-policy";
import type { CampaignHistory } from "./campaign-policy";
import { deliverCampaignOnce } from "./campaign-delivery";
import { brandedEmailDocument, sendBrevoEmail } from "./send";
import { enlaceDeBaja } from "./baja";
import { escaparHtml } from "./escape";
import { resumenDeCuota } from "./cuota";
type Admin = ReturnType<typeof createAdminClient>;
const ACCOUNT_FIELDS = "id,email,full_name,created_at,is_disabled,role,is_provider";
const PRO_FIELDS = "profile_id,created_at,review_count,services,is_banned,oculto_del_buscador,slug";
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
  const [accounts, professionals, history, bajas, projects] = await Promise.all([
    all<LifecycleAccount>((a,b) => db.from("profiles").select(ACCOUNT_FIELDS).eq("is_disabled",false).order("created_at").order("id").range(a,b)),
    all<LifecycleProfessional>((a,b) => db.from("professionals").select(PRO_FIELDS).order("id").range(a,b)),
    all<CampaignHistory>((a,b) => db.from("admin_campaign_sends").select("profile_id,email,campana,status,enviado_en,rebote_en").order("id").range(a,b)),
    all<{correo:string}>((a,b) => db.from("email_bajas").select("correo").order("correo").range(a,b)),
    all<{client_id:string}>((a,b) => db.from("projects").select("client_id").order("id").range(a,b)),
  ]);
  const proByAccount = new Map(professionals.map((p) => [p.profile_id,p]));
  const projectOwners = new Set(projects.map((p) => p.client_id));
  const blocked = bajas.map((b) => b.correo);
  const counts: Record<string,number> = {};
  const candidates = accounts.flatMap((account) => {
    const campaign = lifecycleCandidate(account,proByAccount.get(account.id),history,blocked,projectOwners.has(account.id));
    if (!campaign) return [];
    counts[campaign.key] = (counts[campaign.key] ?? 0) + 1;
    return [{ account, campaign }];
  });
  // Finish missing professional steps before consuming the quota on general tips.
  candidates.sort((a,b) => LIFECYCLE_CAMPAIGNS.findIndex((c) => c.key === a.campaign.key)
    - LIFECYCLE_CAMPAIGNS.findIndex((c) => c.key === b.campaign.key));
  if (simulate) return { simulate:true, eligible:counts, sent:0 };
  let sent = 0, uncertain = 0, skipped = 0;
  const delivered: Record<string,number> = {};
  for (const {account,campaign} of candidates.slice(0,250)) {
    if (!(await resumenDeCuota()).puedeEnviar.masivo) break;
    const result = await deliverCampaignOnce(db,campaign.key,account.email!,async () => {
      // Recheck role, completed steps, opt-out and history immediately before delivery.
      const [a,p,h,b,j] = await Promise.all([
        db.from("profiles").select(ACCOUNT_FIELDS).eq("id",account.id).single(),
        db.from("professionals").select(PRO_FIELDS).eq("profile_id",account.id).maybeSingle(),
        db.from("admin_campaign_sends").select("profile_id,email,campana,status,enviado_en,rebote_en").eq("profile_id",account.id).neq("campana",campaign.key),
        db.from("email_bajas").select("correo").ilike("correo",account.email!),
        db.from("projects").select("client_id").eq("client_id",account.id).limit(1),
      ]);
      if (!a.data || [a,p,h,b,j].some((r) => r.error)) throw new Error("Cannot verify lifecycle recipient");
      const current = lifecycleCandidate(a.data as LifecycleAccount,p.data as LifecycleProfessional | undefined,
        h.data as CampaignHistory[],(b.data ?? []).map((r) => r.correo),Boolean(j.data?.length));
      if (!current || current.key !== campaign.key || a.data.email?.toLowerCase() !== account.email?.toLowerCase())
        return {ok:false,status:"skipped" as const,detail:"No longer eligible"};
      const href = new URL(campaign.ctaPath,origin);
      href.searchParams.set("utm_source","correo"); href.searchParams.set("utm_medium","campana"); href.searchParams.set("utm_campaign",campaign.key);
      const name = (account.full_name ?? "").trim().split(/\s+/)[0];
      const greeting = /^[\p{L}][\p{L}'-]{1,}$/u.test(name) ? `<p>Hola ${escaparHtml(name)},</p>` : "";
      const bodyHtml = greeting + campaign.body.split(/\n\n/).map((s) => `<p style="font-size:15px;line-height:1.6">${escaparHtml(s)}</p>`).join("")
        + `<p><a href="${escaparHtml(href)}" style="display:inline-block;background:#009FD9;color:white;padding:12px 22px;border-radius:24px;text-decoration:none">${escaparHtml(campaign.ctaLabel)}</a></p>`
        + `<p>Equipo ContrataCR</p><p><a href="${origin}/soporte">Soporte en ContrataCR</a></p>`
        + `<p style="font-size:12px">Recibes este correo porque tienes una cuenta en ContrataCR. <a href="${escaparHtml(enlaceDeBaja(origin,account.email!))}">No quiero recibir novedades</a>.</p>`;
      return sendBrevoEmail({to:account.email!,subject:campaign.subject,nivel:"masivo",campana:campaign.key,
        html:brandedEmailDocument({title:campaign.subject,bodyHtml,origin})});
    },{coordinated:true});
    if (result === "sent") { sent++; delivered[campaign.key]=(delivered[campaign.key] ?? 0)+1; }
    else if (result === "uncertain") uncertain++; else skipped++;
  }
  return {simulate:false,eligible:counts,sent,delivered,uncertain,skipped};
}
