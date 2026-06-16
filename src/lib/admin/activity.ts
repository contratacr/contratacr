import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";

// ── Recent cross-table activity feed for the admin "Actividad" view. ──
export type ActivityKind = "pro" | "client" | "solicitud" | "proyecto" | "ticket";
export type ActivityEvent = { id: string; kind: ActivityKind; title: string; sub: string; createdAt: string };

export async function getAdminActivity(limit = 40, locale = "es"): Promise<ActivityEvent[]> {
  try {
    const admin = createAdminClient();
    const N = 15;
    const [pros, clients, bookings, projects, tickets] = await Promise.all([
      admin.from("professionals").select("id, created_at, category_id, profiles(full_name)").order("created_at", { ascending: false }).limit(N),
      admin.from("profiles").select("id, created_at, full_name").eq("role", "client").order("created_at", { ascending: false }).limit(N),
      admin.from("bookings").select("id, created_at, service_description, client_name").order("created_at", { ascending: false }).limit(N),
      admin.from("projects").select("id, created_at, title, category_id").order("created_at", { ascending: false }).limit(N),
      admin.from("support_tickets").select("id, created_at, subject, name").order("created_at", { ascending: false }).limit(N),
    ]);

    const events: ActivityEvent[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (pros.data ?? []) as any[]) events.push({ id: `pro-${p.id}`, kind: "pro", title: p.profiles?.full_name || "Profesional", sub: `Nuevo profesional${p.category_id ? ` · ${getCategoryLabel(p.category_id, locale)}` : ""}`, createdAt: p.created_at });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (clients.data ?? []) as any[]) events.push({ id: `cli-${c.id}`, kind: "client", title: c.full_name || "Cliente", sub: "Nuevo cliente", createdAt: c.created_at });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of (bookings.data ?? []) as any[]) events.push({ id: `sol-${b.id}`, kind: "solicitud", title: b.client_name || "Cliente", sub: `Solicitud: ${(b.service_description || "").slice(0, 60) || "servicio"}`, createdAt: b.created_at });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const pr of (projects.data ?? []) as any[]) events.push({ id: `proy-${pr.id}`, kind: "proyecto", title: pr.title || "Proyecto", sub: `Proyecto publicado${pr.category_id ? ` · ${getCategoryLabel(pr.category_id, locale)}` : ""}`, createdAt: pr.created_at });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (tickets.data ?? []) as any[]) events.push({ id: `tic-${t.id}`, kind: "ticket", title: t.name || "Soporte", sub: `Ticket: ${(t.subject || "consulta").slice(0, 60)}`, createdAt: t.created_at });

    return events
      .filter((e) => e.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  } catch (err) {
    console.error("[getAdminActivity]", err);
    return [];
  }
}
