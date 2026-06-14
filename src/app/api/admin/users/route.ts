import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanId, maskId } from "@/lib/cedula";

// GET /api/admin/users?q=…  — search users by name / cédula / email (admin-only).
// GET /api/admin/users?id=… — consolidated case file for ONE user: account,
//   professional record, support tickets, verification history + appeals,
//   reports, projects (as client) and requests (bookings). `id` may be a
//   profile/user id OR a professional id (resolved to its owner).
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(req.url);
  const db = createAdminClient();
  const id = url.searchParams.get("id");

  // ── Detail ──────────────────────────────────────────────────────────────
  if (id) {
    let profileId = id;
    let { data: profile } = await db
      .from("profiles")
      .select("id, full_name, email, cedula, phone, role, avatar_url, is_disabled, disabled_reason, disabled_at, created_at")
      .eq("id", id)
      .maybeSingle();

    // Not a profile id? It may be a professional id — resolve to its owner.
    if (!profile) {
      const { data: owner } = await db.from("professionals").select("profile_id").eq("id", id).maybeSingle();
      if (owner?.profile_id) {
        profileId = owner.profile_id;
        ({ data: profile } = await db
          .from("profiles")
          .select("id, full_name, email, cedula, phone, role, avatar_url, is_disabled, disabled_reason, disabled_at, created_at")
          .eq("id", profileId)
          .maybeSingle());
      }
    }

    if (!profile) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

    const { data: professional } = await db
      .from("professionals")
      .select("id, slug, verification_status, verification_reason, verification_updated_at, is_banned, banned_reason, category_id, professions, business_name, whatsapp, call_phone, allow_phone_call, created_at")
      .eq("profile_id", profileId)
      .maybeSingle();

    const { data: tickets } = await db
      .from("support_tickets")
      .select("id, subject, status, topic, created_at, last_reply_at, last_reply_role")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false });

    const { data: projects } = await db
      .from("projects")
      .select("id, title, status, category_id, created_at")
      .eq("client_id", profileId)
      .order("created_at", { ascending: false });

    const { data: bookings } = await db
      .from("bookings")
      .select("id, service_description, status, preferred_date, created_at")
      .eq("client_id", profileId)
      .order("created_at", { ascending: false });

    // Pro-specific history (verification decisions, appeals, reports against them)
    let verificationLog: unknown[] = [];
    let appeals: unknown[] = [];
    let reports: unknown[] = [];
    if (professional) {
      const [log, ap, rep] = await Promise.all([
        db.from("provider_verification_log").select("*").eq("professional_id", professional.id).order("created_at", { ascending: false }),
        db.from("provider_appeals").select("*").eq("professional_id", professional.id).order("created_at", { ascending: false }),
        db.from("reports").select("id, reason, status, reporter_email, created_at").eq("professional_id", professional.id).order("created_at", { ascending: false }),
      ]);
      verificationLog = log.data ?? [];
      appeals = ap.data ?? [];
      reports = rep.data ?? [];
    }

    return NextResponse.json({
      // Cédula is masked here for privacy — the full value lives only in the
      // verification case file where a human reviewer needs it.
      profile: { ...profile, cedula: profile.cedula ? maskId(profile.cedula) : null },
      professional: professional ?? null,
      tickets: tickets ?? [],
      projects: projects ?? [],
      bookings: bookings ?? [],
      verificationLog,
      appeals,
      reports,
    });
  }

  // ── Search ──────────────────────────────────────────────────────────────
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ users: [] });

  const like = `%${q}%`;
  const ced = cleanId(q);
  const ors = [`full_name.ilike.${like}`, `email.ilike.${like}`];
  if (ced) ors.push(`cedula.ilike.%${ced}%`);

  const { data } = await db
    .from("profiles")
    .select("id, full_name, email, cedula, role, avatar_url, is_disabled, professionals(verification_status, is_banned)")
    .or(ors.join(","))
    .limit(25);

  const users = (data ?? []).map((u) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pro = Array.isArray((u as any).professionals) ? (u as any).professionals[0] : (u as any).professionals;
    return {
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      cedula: u.cedula ? maskId(u.cedula) : null,
      role: u.role,
      avatar_url: u.avatar_url,
      is_disabled: u.is_disabled,
      isPro: !!pro,
      verification_status: pro?.verification_status ?? null,
      is_banned: pro?.is_banned ?? false,
    };
  });

  return NextResponse.json({ users });
}
