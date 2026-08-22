import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";

// /api/admin/marketplace — the job board and the offers board as the owner sees
// them: every publication with the account that created it, its status, its
// reach (applications for jobs) and the moderation actions an admin can take.
//
//   GET  ?kind=jobs|offers&filter=all|published|paused|closed|expired|sold_out|draft&q=&page=
//   PATCH { kind, id, status }   — pause, republish, close or expire a publication

const JOB_STATUSES = new Set(["draft", "published", "paused", "closed"]);
const OFFER_STATUSES = new Set(["draft", "published", "paused", "expired", "sold_out"]);
const PAGE_SIZE = 25;

type CreatorRow = {
  id: string;
  profile_id: string | null;
  slug: string | null;
  business_name: string | null;
  verification_status: string | null;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
};

type JobRow = {
  id: string;
  employer_id: string | null;
  title: string | null;
  status: string | null;
  employment_type: string | null;
  workplace_type: string | null;
  provincia_id: string | null;
  canton_id: string | null;
  location_label: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  currency: string | null;
  show_salary: boolean | null;
  openings: number | null;
  application_deadline: string | null;
  service_category_id: string | null;
  created_at: string;
  updated_at: string | null;
  job_applications?: { count: number }[] | null;
};

type OfferRow = {
  id: string;
  professional_id: string | null;
  title: string | null;
  status: string | null;
  offer_type: string | null;
  service_label: string | null;
  service_category_id: string | null;
  image_urls: string[] | null;
  price_now: number | null;
  price_before: number | null;
  currency: string | null;
  price_unit: string | null;
  location_label: string | null;
  valid_until: string | null;
  quantity_available: number | null;
  created_at: string;
  updated_at: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function placeLabel(provinciaId: string | null, cantonId: string | null, fallback: string | null) {
  const canton = cantonId ? getCantonById(cantonId)?.name : null;
  const province = provinciaId ? getProvinceById(provinciaId)?.name : null;
  const parts = [canton, province].filter(Boolean);
  return parts.length ? parts.join(", ") : fallback || "Costa Rica";
}

function creatorOf(row: CreatorRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    profileId: row.profile_id,
    slug: row.slug,
    name: (row.business_name ?? "").trim().length > 1 ? (row.business_name as string).trim() : row.profiles?.full_name || "Profesional",
    personName: row.profiles?.full_name ?? null,
    email: row.profiles?.email ?? null,
    avatarUrl: row.profiles?.avatar_url ?? null,
    verified: row.verification_status === "verified",
  };
}

export async function GET(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "offers" ? "offers" : "jobs";
  const filter = url.searchParams.get("filter") ?? "all";
  const q = normalize(url.searchParams.get("q")).trim().slice(0, 100);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const db = createAdminClient();

  const listRes = kind === "jobs"
    ? await db
      .from("job_posts")
      .select("id, employer_id, title, status, employment_type, workplace_type, provincia_id, canton_id, location_label, salary_min, salary_max, salary_period, currency, show_salary, openings, application_deadline, service_category_id, created_at, updated_at, job_applications(count)")
      .order("created_at", { ascending: false })
    : await db
      .from("professional_offers")
      .select("id, professional_id, title, status, offer_type, service_label, service_category_id, image_urls, price_now, price_before, currency, price_unit, location_label, valid_until, quantity_available, created_at, updated_at")
      .order("created_at", { ascending: false });

  if (listRes.error) {
    console.error(`[admin/marketplace] ${kind}`, listRes.error.message);
    return NextResponse.json({ error: "No se pudo cargar el marketplace." }, { status: 500 });
  }

  const rows = (listRes.data ?? []) as unknown as Array<JobRow | OfferRow>;
  const creatorIds = [...new Set(rows.map((row) => ("employer_id" in row ? row.employer_id : row.professional_id)).filter(Boolean))] as string[];
  const creatorsRes = creatorIds.length
    ? await db.from("professionals").select("id, profile_id, slug, business_name, verification_status, profiles(full_name, email, avatar_url)").in("id", creatorIds)
    : { data: [] as CreatorRow[] };
  const creators = new Map(((creatorsRes.data ?? []) as unknown as CreatorRow[]).map((row) => [row.id, row]));

  const items = rows.map((row) => {
    const creator = creatorOf(creators.get(("employer_id" in row ? row.employer_id : row.professional_id) ?? ""));
    const category = row.service_category_id ? getCategoryLabel(row.service_category_id) : null;
    if ("employer_id" in row) {
      const applications = Array.isArray(row.job_applications) ? Number(row.job_applications[0]?.count ?? 0) : 0;
      return {
        kind: "job" as const,
        id: row.id,
        title: row.title ?? "Sin título",
        status: row.status ?? "draft",
        category,
        place: placeLabel(row.provincia_id, row.canton_id, row.location_label),
        employmentType: row.employment_type,
        workplaceType: row.workplace_type,
        salary: row.show_salary === false ? null : { min: row.salary_min, max: row.salary_max, period: row.salary_period, currency: row.currency ?? "CRC" },
        openings: row.openings ?? 1,
        deadline: row.application_deadline,
        applications,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        creator,
        href: `/empleos/${row.id}`,
      };
    }
    return {
      kind: "offer" as const,
      id: row.id,
      title: row.title ?? "Sin título",
      status: row.status ?? "draft",
      category: category ?? row.service_label,
      place: row.location_label || "Costa Rica",
      offerType: row.offer_type,
      image: Array.isArray(row.image_urls) ? row.image_urls[0] ?? null : null,
      price: { now: row.price_now, before: row.price_before, unit: row.price_unit, currency: row.currency ?? "CRC" },
      quantity: row.quantity_available,
      validUntil: row.valid_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      creator,
      href: `/ofertas/${row.id}`,
    };
  });

  const counts: Record<string, number> = { all: items.length };
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;

  const filtered = items.filter((item) => {
    if (filter !== "all" && item.status !== filter) return false;
    if (!q) return true;
    const haystack = normalize([item.title, item.category, item.place, item.creator?.name, item.creator?.personName, item.creator?.email, item.id].filter(Boolean).join(" "));
    return haystack.includes(q);
  });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;

  return NextResponse.json({
    kind,
    items: filtered.slice(start, start + PAGE_SIZE),
    counts,
    pagination: { page: current, pageSize: PAGE_SIZE, total, pages },
  });
}

export async function PATCH(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { kind?: string; id?: string; status?: string };
  const kind = body.kind === "offers" || body.kind === "offer" ? "offers" : "jobs";
  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" ? body.status : "";
  const allowed = kind === "jobs" ? JOB_STATUSES : OFFER_STATUSES;
  if (!id || !allowed.has(status)) return NextResponse.json({ error: "Estado no válido." }, { status: 400 });

  const db = createAdminClient();
  const table = kind === "jobs" ? "job_posts" : "professional_offers";
  const { data, error } = await db.from(table).update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("id, status").maybeSingle();
  if (error) {
    console.error(`[admin/marketplace] ${kind} status`, error.message);
    return NextResponse.json({ error: "No se pudo actualizar la publicación." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "La publicación ya no existe." }, { status: 404 });
  return NextResponse.json({ id: data.id, status: data.status });
}

// DELETE /api/admin/marketplace?kind=jobs|offers&id=… — removes the publication,
// its follower-feed rows and the notifications that pointed at it.
export async function DELETE(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "offers" ? "offers" : "jobs";
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Identificador requerido." }, { status: 400 });
  const db = createAdminClient();
  await db.from("notifications").delete().eq("type", "followed_professional_activity").eq("data->>content_id", id);
  await db.from("professional_activity").delete().eq("content_id", id);
  const { error } = await db.from(kind === "jobs" ? "job_posts" : "professional_offers").delete().eq("id", id);
  if (error) {
    console.error(`[admin/marketplace] delete ${kind}`, error.message);
    return NextResponse.json({ error: "No se pudo eliminar la publicación." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
