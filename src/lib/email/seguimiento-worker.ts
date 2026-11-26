import type { createAdminClient } from "@/lib/supabase/admin";
import { nombreDeSaludo } from "@/lib/nombres";
import { matchesProjectCoverage } from "@/lib/projects/project-recipients";
import { tienePrecioReal } from "@/lib/notifications/empujones-del-perfil";
import type { CampaignHistory } from "./campaign-policy";
import { isInternalCampaignRecipient, normalizeCampaignEmail } from "./campaign-policy";
import { brandedEmailDocument } from "./send";
import { enlaceDeBaja } from "./baja";
import { escaparHtml } from "./escape";
import {
  followupCandidate, followupWindows, REVIEW_ASK_AFTER_DAYS, REVIEW_ASK_UNTIL_DAYS,
  type FollowupContext, type FollowupEmail,
} from "./seguimiento-policy";

type Admin = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;
const DAY = 86_400_000;

async function all<T>(query: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await query(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

/** El mismo correo que las campañas de bienvenida: saludo, párrafos, botón, baja. */
export function renderFollowupHtml(origin: string, email: string, fullName: string | null, f: FollowupEmail) {
  const href = new URL(f.ctaPath, origin);
  href.searchParams.set("utm_source", "correo"); href.searchParams.set("utm_medium", "seguimiento"); href.searchParams.set("utm_campaign", f.kind);
  const name = nombreDeSaludo(fullName);
  const greeting = /^[\p{L}][\p{L}'-]{1,}$/u.test(name) ? `<p>Hola ${escaparHtml(name)},</p>` : "<p>Hola,</p>";
  const bodyHtml = greeting + f.body.split(/\n\n/).map((s) => `<p style="font-size:15px;line-height:1.6">${escaparHtml(s)}</p>`).join("")
    + `<p><a href="${escaparHtml(href.toString())}" style="display:inline-block;background:#009FD9;color:white;padding:12px 22px;border-radius:24px;text-decoration:none">${escaparHtml(f.ctaLabel)}</a></p>`
    + `<p>Equipo ContrataCR</p><p><a href="${origin}/soporte">Soporte en ContrataCR</a></p>`
    + `<p style="font-size:12px">Recibe este correo porque tiene una cuenta en ContrataCR. <a href="${escaparHtml(enlaceDeBaja(origin, email))}">No quiero recibir novedades</a>.</p>`;
  return brandedEmailDocument({ title: f.subject, bodyHtml, origin });
}

export type FollowupAccount = { id: string; email: string | null; full_name: string | null; created_at: string | null; role: string | null; lastSignInAt?: string | null };

/**
 * Datos de todas las cuentas para decidir sus seguimientos. Solo carga lo que
 * la ventana de hoy necesita: fuera de las ventanas, únicamente los contactos
 * pendientes de reseña (una consulta pequeña).
 */
export async function loadFollowupContexts(db: Admin, accounts: FollowupAccount[], history: CampaignHistory[],
  unsubscribed: string[], onboardingPending: Set<string>, now = Date.now()) {
  const w = followupWindows(now);
  const since30 = new Date(now - 30 * DAY).toISOString();
  const [pros, asks] = await Promise.all([
    all<Row>((a, b) => db.from("professionals")
      .select("id,profile_id,slug,is_banned,oculto_del_buscador,review_count,services,portfolio_urls,category_id,professions,provincia_id,canton_id,coverage_country,coverage_provincias,coverage_areas,workplaces,created_at")
      .order("id").range(a, b)),
    all<Row>((a, b) => db.from("whatsapp_contact_followups")
      .select("id,client_id,professional_name,service_name,status,contacted_at,responded_at")
      .in("status", ["contacted", "hire_intent"]).not("client_id", "is", null).is("responded_at", null)
      .gte("contacted_at", new Date(now - REVIEW_ASK_UNTIL_DAYS * DAY).toISOString())
      .lte("contacted_at", new Date(now - REVIEW_ASK_AFTER_DAYS * DAY).toISOString())
      .order("id").range(a, b)),
  ]);

  // Eventos: solo dentro de las ventanas que los usan.
  const events = w.any ? await all<Row>((a, b) => db.from("interaction_events")
    .select("professional_id,event_type,source,viewer_user_id,visitor_hash,category_id,metadata,created_at")
    .in("event_type", ["profile_view", "whatsapp_click", "phone_click", "search_performed"])
    .gte("created_at", since30).order("id").range(a, b)) : [];
  const clientSearches = w.mensual ? await all<Row>((a, b) => db.from("interaction_events")
    .select("viewer_user_id,metadata,created_at").eq("event_type", "search_performed").not("viewer_user_id", "is", null)
    .gte("created_at", new Date(now - 90 * DAY).toISOString()).order("created_at", { ascending: false }).range(a, b)) : [];
  const [provincias, categorias] = w.mensual ? await Promise.all([
    all<Row>((a, b) => db.from("provincias").select("id,name").order("id").range(a, b)),
    all<Row>((a, b) => db.from("categories").select("id,name").order("id").range(a, b)),
  ]) : [[], []];
  const provinceName = new Map(provincias.map((p) => [String(p.id), String(p.name)]));
  const categoryName = new Map(categorias.map((c) => [String(c.id), String(c.name)]));

  // Última actividad: inicio de sesión o cualquier uso registrado de la app.
  const lastActive = new Map<string, number>();
  const seen = (id: unknown, at: unknown) => {
    const t = Date.parse(String(at ?? ""));
    if (typeof id === "string" && Number.isFinite(t) && t > (lastActive.get(id) ?? 0)) lastActive.set(id, t);
  };
  for (const a of accounts) seen(a.id, a.lastSignInAt);
  for (const e of events) seen(e.viewer_user_id, e.created_at);
  for (const e of clientSearches) seen(e.viewer_user_id, e.created_at);

  const proByAccount = new Map(pros.filter((p) => p.profile_id).map((p) => [String(p.profile_id), p]));
  const visible = (p: Row) => p.is_banned === false && p.oculto_del_buscador === false && Boolean(p.slug);
  const categoriesOf = (p: Row) => [...new Set([...(Array.isArray(p.professions) ? p.professions as string[] : []), ...(p.category_id ? [String(p.category_id)] : [])])];

  // Profesionales nuevos y visibles por provincia, últimos 30 días.
  const newByProvince = new Map<string, { count: number; services: string[] }>();
  if (w.mensual) for (const p of pros) {
    if (!visible(p) || !p.provincia_id || Date.parse(String(p.created_at ?? "")) < now - 30 * DAY) continue;
    const slot = newByProvince.get(String(p.provincia_id)) ?? { count: 0, services: [] };
    slot.count++;
    const servicio = categoriesOf(p).map((c) => categoryName.get(c)).find(Boolean);
    if (servicio && !slot.services.includes(servicio.toLowerCase())) slot.services.push(servicio.toLowerCase());
    newByProvince.set(String(p.provincia_id), slot);
  }
  // Provincia más reciente que buscó cada cliente.
  const searchProvince = new Map<string, string>();
  for (const e of clientSearches) {
    const prov = (e.metadata as Row | null)?.provincia;
    if (typeof prov === "string" && prov && !searchProvince.has(String(e.viewer_user_id))) searchProvince.set(String(e.viewer_user_id), prov);
  }
  // Contacto pendiente de reseña más reciente por cliente.
  const askByClient = new Map<string, Row>();
  for (const a of asks) {
    const prev = askByClient.get(String(a.client_id));
    if (!prev || Date.parse(String(a.contacted_at)) > Date.parse(String(prev.contacted_at))) askByClient.set(String(a.client_id), a);
  }

  const blocked = new Set(unsubscribed.map(normalizeCampaignEmail));
  return accounts.flatMap((account) => {
    const email = normalizeCampaignEmail(account.email ?? "");
    if (!email.includes("@") || email.endsWith("@contratacr.test") || isInternalCampaignRecipient(email, account.role)) return [];
    const pro = proByAccount.get(account.id);
    const ctx: FollowupContext = {
      professional: Boolean(pro) || account.role === "professional",
      accountAgeDays: (now - Date.parse(account.created_at ?? "")) / DAY,
      onboardingDone: !onboardingPending.has(account.id),
      lastActiveAt: lastActive.get(account.id) ?? null,
      history: history.filter((r) => r.profile_id === account.id || normalizeCampaignEmail(r.email) === email),
      unsubscribed: blocked.has(email),
    };
    if (pro && visible(pro)) {
      // Los mismos filtros que el panel de estadísticas (get_account_activity).
      const own = events.filter((e) => e.professional_id === pro.id && e.viewer_user_id !== account.id);
      const cats = new Set(categoriesOf(pro));
      const searchers = new Set(events.filter((e) => e.event_type === "search_performed" && e.viewer_user_id !== account.id
        && typeof e.category_id === "string" && cats.has(e.category_id)
        && (() => { const m = (e.metadata ?? {}) as Row; const prov = typeof m.provincia === "string" ? m.provincia : null; const can = typeof m.canton === "string" ? m.canton : null;
          return Boolean(prov || can) && matchesProjectCoverage(pro, prov, can); })())
        .map((e) => String(e.visitor_hash)));
      const principal = categoriesOf(pro)[0];
      ctx.pro = {
        views: own.filter((e) => e.event_type === "profile_view").length,
        contacts: own.filter((e) => (e.event_type === "whatsapp_click" && ["profile", "profile_service", "search"].includes(String(e.source)))
          || (e.event_type === "phone_click" && ["profile", "search"].includes(String(e.source)))).length,
        searchers: searchers.size,
        serviceName: principal ? (categoryName.get(principal) ?? null)?.toLowerCase() ?? null : null,
        hasReviews: Number(pro.review_count ?? 0) > 0,
        hasPhotos: Array.isArray(pro.portfolio_urls) && pro.portfolio_urls.length > 0,
        hasPrice: tienePrecioReal(pro.services),
      };
    }
    if (!ctx.professional) {
      const ask = askByClient.get(account.id);
      const provId = searchProvince.get(account.id);
      const nuevos = provId ? newByProvince.get(provId) : undefined;
      ctx.client = {
        reviewAsk: ask ? { id: String(ask.id), professionalName: String(ask.professional_name), serviceName: ask.service_name ? String(ask.service_name).toLowerCase() : null } : null,
        province: provId && nuevos && provinceName.has(provId) ? { id: provId, name: provinceName.get(provId)!, newPros: nuevos.count, services: nuevos.services } : null,
      };
    }
    return [{ account, ctx }];
  });
}

/** Cuántas cuentas recibirían cada seguimiento hoy (para el panel; no envía nada). */
export function countFollowups(contexts: { ctx: FollowupContext }[], now = Date.now(), includeUnapproved = true) {
  const counts: Record<string, number> = {};
  for (const { ctx } of contexts) {
    const f = followupCandidate(ctx, now, includeUnapproved);
    if (f) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  }
  return counts;
}
