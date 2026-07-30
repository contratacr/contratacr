import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanId } from "@/lib/cedula";

type ListedProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  cedula: string | null;
  role: string | null;
  avatar_url: string | null;
  is_disabled: boolean | null;
  client_identity_status: string | null;
  created_at: string;
  professionals?: unknown;
};

// GET /api/admin/users?q=…  — search users by name / cédula / email (admin-only).
// GET /api/admin/users?mode=list — paginated admin directory of all accounts.
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
  const mode = url.searchParams.get("mode");

  async function getIncompleteProfessionalSignupIds() {
    const ids = new Set<string>();
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("[admin/users] auth list error:", error);
        break;
      }
      const users = data.users ?? [];
      for (const user of users) {
        const metadata = user.user_metadata ?? {};
        if (metadata.professional_signup_started === true && metadata.is_provider !== true) {
          ids.add(user.id);
        }
      }
      if (users.length < 1000) break;
    }
    return ids;
  }

  function firstProfessional(profile: ListedProfile) {
    const relation = profile.professionals;
    return Array.isArray(relation) ? relation[0] : relation;
  }

  function norm(value: string | null | undefined) {
    return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  if (mode === "list") {
    const filter = url.searchParams.get("filter") ?? "all";
    const verification = url.searchParams.get("verification") ?? "all";
    const q = (url.searchParams.get("q") ?? "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? "25") || 25));

    const allProfiles: ListedProfile[] = [];
    const batchSize = 1000;
    for (let from = 0; from < 10000; from += batchSize) {
      const { data, error } = await db
        .from("profiles")
        .select("id, full_name, email, cedula, role, avatar_url, is_disabled, client_identity_status, created_at, professionals(id, verification_status, is_banned, business_name)")
        .order("created_at", { ascending: false })
        .range(from, from + batchSize - 1);
      if (error) {
        console.error("[admin/users] list error:", error);
        return NextResponse.json({ error: "No se pudo cargar usuarios." }, { status: 500 });
      }
      allProfiles.push(...((data ?? []) as ListedProfile[]));
      if ((data ?? []).length < batchSize) break;
    }

    const incompleteIds = await getIncompleteProfessionalSignupIds();
    const rows = allProfiles.map((profile) => {
      const pro = firstProfessional(profile) as { id?: string; verification_status?: string | null; is_banned?: boolean | null; business_name?: string | null } | undefined;
      const isPro = !!pro?.id;
      const professionalSignupIncomplete = !isPro && incompleteIds.has(profile.id);
      const kind = isPro
        ? "professional"
        : professionalSignupIncomplete
          ? "incomplete"
          : profile.role === "admin"
            ? "admin"
            : "client";
      const verificationStatus = isPro
        ? pro?.verification_status ?? null
        : ["verified", "pending", "rejected"].includes(profile.client_identity_status ?? "")
          ? profile.client_identity_status
          : null;
      return {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        cedula: profile.cedula,
        role: profile.role,
        avatar_url: profile.avatar_url,
        created_at: profile.created_at,
        is_disabled: profile.is_disabled === true,
        isPro,
        business_name: pro?.business_name ?? null,
        professionalSignupIncomplete,
        kind,
        verification_status: verificationStatus,
        is_banned: pro?.is_banned === true,
      };
    });

    const counts = {
      all: rows.length,
      professional: rows.filter((row) => row.kind === "professional").length,
      incomplete: rows.filter((row) => row.kind === "incomplete").length,
      client: rows.filter((row) => row.kind === "client").length,
      admin: rows.filter((row) => row.kind === "admin").length,
      disabled: rows.filter((row) => row.is_disabled).length,
    };

    const queryTokens = norm(q).split(/\s+/).filter(Boolean);
    const filtered = rows.filter((row) => {
      if (filter === "professional" && row.kind !== "professional") return false;
      if (filter === "incomplete" && row.kind !== "incomplete") return false;
      if (filter === "client" && row.kind !== "client") return false;
      if (filter === "admin" && row.kind !== "admin") return false;
      if (filter === "disabled" && !row.is_disabled) return false;
      if (verification !== "all") {
        if (!row.isPro) return false;
        if (verification === "banned" && !row.is_banned) return false;
        if (verification === "unverified" && row.verification_status != null) return false;
        if (!["banned", "unverified"].includes(verification) && row.verification_status !== verification) return false;
      }
      if (queryTokens.length === 0) return true;
      const haystack = norm(`${row.full_name ?? ""} ${row.business_name ?? ""} ${row.email ?? ""} ${row.cedula ?? ""}`);
      return queryTokens.every((token) => haystack.includes(token));
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    return NextResponse.json({
      users: filtered.slice(start, start + pageSize),
      counts,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  }

  // ── Detail ──────────────────────────────────────────────────────────────
  if (id) {
    let profileId = id;
    let { data: profile } = await db
      .from("profiles")
      .select("id, full_name, email, cedula, phone, role, avatar_url, is_disabled, disabled_reason, disabled_at, client_identity_status, client_identity_verified_at, client_identity_provider, created_at")
      .eq("id", id)
      .maybeSingle();

    // Not a profile id? It may be a professional id — resolve to its owner.
    if (!profile) {
      const { data: owner } = await db.from("professionals").select("profile_id").eq("id", id).maybeSingle();
      if (owner?.profile_id) {
        profileId = owner.profile_id;
        ({ data: profile } = await db
          .from("profiles")
          .select("id, full_name, email, cedula, phone, role, avatar_url, is_disabled, disabled_reason, disabled_at, client_identity_status, client_identity_verified_at, client_identity_provider, created_at")
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

    const { data: authUser } = await db.auth.admin.getUserById(profileId);
    const userMetadata = authUser?.user?.user_metadata ?? {};
    const professionalSignupIncomplete =
      userMetadata.professional_signup_started === true &&
      userMetadata.is_provider !== true &&
      !professional;

    const [followingRowsResult, followerRowsResult] = await Promise.all([
      db
        .from("professional_follows")
        .select("id, professional_id, created_at")
        .eq("follower_id", profileId)
        .order("created_at", { ascending: false }),
      professional
        ? db
            .from("professional_follows")
            .select("id, follower_id, created_at")
            .eq("professional_id", professional.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const followingRows = followingRowsResult.data ?? [];
    const followerRows = followerRowsResult.data ?? [];
    const followedProfessionalIds = followingRows.map((row) => row.professional_id);
    const followerProfileIds = followerRows.map((row) => row.follower_id);
    const [followedProsResult, followerProfilesResult] = await Promise.all([
      followedProfessionalIds.length > 0
        ? db
            .from("professionals")
            .select("id, slug, business_name, profile_id, profiles(full_name, avatar_url)")
            .in("id", followedProfessionalIds)
        : Promise.resolve({ data: [] }),
      followerProfileIds.length > 0
        ? db
            .from("profiles")
            .select("id, full_name, avatar_url, professionals(id, slug, business_name)")
            .in("id", followerProfileIds)
        : Promise.resolve({ data: [] }),
    ]);
    const followedPros = new Map((followedProsResult.data ?? []).map((item) => [item.id, item]));
    const followerProfiles = new Map((followerProfilesResult.data ?? []).map((item) => [item.id, item]));
    const followNetwork = {
      following: followingRows.map((row) => ({ ...row, professional: followedPros.get(row.professional_id) ?? null })),
      followers: followerRows.map((row) => ({ ...row, profile: followerProfiles.get(row.follower_id) ?? null })),
    };

    const { data: tickets } = await db
      .from("support_tickets")
      .select("*")
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
    let analytics: Record<string, unknown> | null = null;
    if (professional) {
      const [log, ap, rep, interactionResult] = await Promise.all([
        db.from("provider_verification_log").select("*").eq("professional_id", professional.id).order("created_at", { ascending: false }),
        db.from("provider_appeals").select("*").eq("professional_id", professional.id).order("created_at", { ascending: false }),
        db.from("reports").select("id, reason, status, reporter_email, created_at").eq("professional_id", professional.id).order("created_at", { ascending: false }),
        db.from("interaction_events").select("event_type, visitor_hash, source, created_at").eq("professional_id", professional.id).order("created_at", { ascending: false }).limit(10000),
      ]);
      verificationLog = log.data ?? [];
      appeals = ap.data ?? [];
      reports = rep.data ?? [];

      const interactions = interactionResult.data ?? [];
      const countType = (types: string[]) => interactions.filter((event) => types.includes(String(event.event_type))).length;
      const sourceCounts = new Map<string, number>();
      for (const event of interactions) {
        const source = String(event.source || "unknown");
        sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      }
      const sourceLabels: Record<string, string> = {
        search: "Buscar",
        profile: "Perfil",
        profile_service: "Servicio del perfil",
        profile_social: "Redes del perfil",
        booking: "Solicitud",
        project: "Publicacion",
        favorites: "Guardados",
        api: "Guardado en backend",
        whatsapp_followup: "WhatsApp histórico",
        unknown: "Sin origen",
      };
      analytics = {
        total: interactions.length,
        uniqueVisitors: new Set(interactions.map((event) => event.visitor_hash).filter(Boolean)).size,
        profileViews: countType(["profile_view"]),
        whatsappClicks: countType(["whatsapp_click"]),
        phoneClicks: countType(["phone_click"]),
        availabilityActions: countType(["availability_view", "schedule_slot_selected"]),
        favorites: countType(["favorite_add"]),
        serviceRequestsStarted: countType(["service_request_started"]),
        serviceRequestsCreated: countType(["service_request_created"]),
        proposalsSent: countType(["proposal_sent"]),
        proposalsAccepted: countType(["proposal_accepted"]),
        reviewsReceived: countType(["review_created"]),
        shares: countType(["profile_share"]),
        lastInteractionAt: interactions[0]?.created_at ?? null,
        bySource: [...sourceCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([source, value]) => ({ label: sourceLabels[source] ?? source, value })),
      };
    }

    return NextResponse.json({
      profile,
      professional: professional ?? null,
      professionalSignupIncomplete,
      tickets: tickets ?? [],
      projects: projects ?? [],
      bookings: bookings ?? [],
      verificationLog,
      appeals,
      reports,
      analytics,
      followNetwork,
    });
  }

  // ── Search ──────────────────────────────────────────────────────────────
  // Smart, word-based matching: EVERY word in the query must appear somewhere in
  // the full name (any order, partial) — so "Isaac Sanchez" finds "Isaac Alberto
  // Sanchez Monge". Email matches the whole query; cédula matches partially.
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ users: [] });

  // Strip chars that have meaning in the PostgREST or()/and() grammar.
  const safe = (s: string) => s.replace(/[(),.*:%]/g, " ").trim();
  const tokens = safe(q).split(/\s+/).filter((t) => t.length > 0);
  const ced = cleanId(q);

  const ors: string[] = [];
  if (tokens.length > 1) {
    // AND across words so every word must be present in the name (order-free).
    ors.push(`and(${tokens.map((t) => `full_name.ilike.%${t}%`).join(",")})`);
  } else if (tokens.length === 1) {
    ors.push(`full_name.ilike.%${tokens[0]}%`);
  }
  const safeQ = safe(q);
  if (safeQ) ors.push(`email.ilike.%${safeQ}%`);
  if (ced) ors.push(`cedula.ilike.%${ced}%`);
  if (ors.length === 0) return NextResponse.json({ users: [] });

  const { data } = await db
    .from("profiles")
    .select("id, full_name, email, cedula, role, avatar_url, is_disabled, professionals(verification_status, is_banned)")
    .or(ors.join(","))
    .limit(50);

  const authStatusById = new Map<string, { professionalSignupIncomplete: boolean }>();
  await Promise.all(
    (data ?? []).map(async (u) => {
      const { data: authUser } = await db.auth.admin.getUserById(u.id);
      const userMetadata = authUser?.user?.user_metadata ?? {};
      authStatusById.set(u.id, {
        professionalSignupIncomplete:
          userMetadata.professional_signup_started === true &&
          userMetadata.is_provider !== true,
      });
    }),
  );

  // Rank in JS (accent-insensitive): full-string + word-start matches score higher.
  const nq = norm(q);
  const nTokens = tokens.map(norm);
  const score = (u: { full_name: string | null; email: string | null }) => {
    const name = norm(u.full_name);
    const words = name.split(/\s+/).filter(Boolean);
    let s = 0;
    if (nq && name.includes(nq)) s += 5;                       // contiguous full match
    for (const t of nTokens) {
      if (words.some((w) => w.startsWith(t))) s += 2;          // matches a name word start
      else if (name.includes(t)) s += 1;                       // partial anywhere
    }
    if (nq && norm(u.email).includes(nq)) s += 1;
    return s;
  };

  const users = (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => score(b) - score(a) || norm(a.full_name).localeCompare(norm(b.full_name)))
    .map((u) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pro = Array.isArray((u as any).professionals) ? (u as any).professionals[0] : (u as any).professionals;
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        cedula: u.cedula ?? null,
        role: u.role,
        avatar_url: u.avatar_url,
        is_disabled: u.is_disabled,
        isPro: !!pro,
        professionalSignupIncomplete: !pro && authStatusById.get(u.id)?.professionalSignupIncomplete === true,
        verification_status: pro?.verification_status ?? null,
        is_banned: pro?.is_banned ?? false,
      };
    });

  return NextResponse.json({ users });
}
