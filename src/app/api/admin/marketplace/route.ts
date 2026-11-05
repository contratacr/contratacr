import { readAllAdminRows, readAdminRowsByIds } from "@/lib/admin/read-all-rows";
import { rutaEmpleo, rutaPromocion } from "@/lib/marketplace-url";
import { moderationAccess } from "@/lib/moderation/admin";
import { NextResponse } from "next/server";
import { getModerationAdmin as getApiAdmin } from "@/lib/moderation/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";

// /api/admin/marketplace — the job board and the offers board as the owner sees
// them: every publication with the account that created it, its status, its
// reach (applications for jobs) and the moderation actions an admin can take.
//
//   GET  ?kind=jobs|offers&filter=all|published|paused|closed|expired|sold_out|draft&q=&page=
//   PATCH { kind, id, status }   — pause, republish, close or expire a publication

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
    ? await readAllAdminRows((from, to) => db
      .from("job_posts")
      .select("id, employer_id, title, status, employment_type, workplace_type, provincia_id, canton_id, location_label, salary_min, salary_max, salary_period, currency, show_salary, openings, application_deadline, service_category_id, created_at, updated_at, job_applications(count)")
      .order("created_at", { ascending: false }).order("id").range(from, to))
    : await readAllAdminRows((from, to) => db
      .from("professional_offers")
      .select("id, professional_id, title, status, offer_type, service_label, service_category_id, image_urls, price_now, price_before, currency, price_unit, location_label, valid_until, quantity_available, created_at, updated_at")
      .order("created_at", { ascending: false }).order("id").range(from, to));

  if (listRes.error) {
    console.error(`[admin/marketplace] ${kind}`, listRes.error.message);
    return NextResponse.json({ error: "No se pudo cargar el marketplace." }, { status: 500 });
  }

  const rows = (listRes.data ?? []) as unknown as Array<JobRow | OfferRow>;
  const held=await readAllAdminRows((from,to)=>db.from("moderation_holds").select("target_id").eq("target_type",kind==="jobs"?"job":"offer").eq("active",true).order("target_id").range(from,to));
  if(held.error)return NextResponse.json({error:"No se pudo comprobar el estado de moderación."},{status:503});
  const heldIds=new Set((held.data??[]).map(row=>row.target_id));
  const creatorIds = [...new Set(rows.map((row) => ("employer_id" in row ? row.employer_id : row.professional_id)).filter(Boolean))] as string[];
  const creatorsRes = creatorIds.length
    ? await readAdminRowsByIds(creatorIds, (batch, from, to) => db.from("professionals").select("id, profile_id, slug, business_name, verification_status, profiles(full_name, email, avatar_url)").in("id", batch).order("id").range(from, to))
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
        moderationHidden:heldIds.has(row.id),
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
        href: rutaEmpleo({ id: row.id, title: row.title }),
      };
    }
    return {
      kind: "offer" as const,
      id: row.id,
      title: row.title ?? "Sin título",
      status: row.status ?? "draft",
      moderationHidden:heldIds.has(row.id),
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
      href: rutaPromocion({ id: row.id, title: row.title }),
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
 const access=await moderationAccess();if(!access)return NextResponse.json({error:"No autorizado"},{status:403});
 if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origen inválido"},{status:403});
 const p=await request.json().catch(()=>({}));
 if(!["jobs","offers"].includes(p.kind)||!p.id||typeof p.reason!=="string"||p.reason.trim().length<5)return NextResponse.json({error:"Indica publicación, estado y motivo."},{status:400});
 const {error}=await access.db.rpc("admin_publication_state",{p_kind:p.kind==="jobs"?"job":"offer",p_id:p.id,p_status:p.status,p_reason:p.reason});
 if(error)return NextResponse.json({error:"No se guardó el estado y su auditoría; comprueba si existe un retiro de moderación."},{status:409});
 return NextResponse.json({id:p.id,status:p.status});
}
export async function DELETE(){if(!(await moderationAccess()))return NextResponse.json({error:"No autorizado"},{status:403});return NextResponse.json({error:"Usa el retiro reversible desde Reportes y moderación."},{status:405});}
