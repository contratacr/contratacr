import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";

type ProposalSummary = {
  id: string;
  status: string | null;
  professional_id: string | null;
};

type ProjectRow = {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  category_id: string | null;
  provincia_id: string | null;
  canton_id: string | null;
  budget_min: number | null;
  budget_max: number | null;
  timeline: string | null;
  client_identity_status: string | null;
  client_id: string | null;
  client_name_snapshot: string | null;
  client_email_snapshot: string | null;
  client_phone_snapshot: string | null;
  accepted_professional_id: string | null;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
  work_done_at: string | null;
  archived_by_client: boolean | null;
  for_someone_else: boolean | null;
  beneficiary_name: string | null;
  beneficiary_dob: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
    cedula: string | null;
    avatar_url: string | null;
  } | null;
  proposals?: ProposalSummary[] | null;
};

type ProfessionalRow = {
  id: string;
  profile_id: string | null;
  slug: string | null;
  business_name: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function countsFor(rows: ProjectRow[]) {
  return {
    all: rows.length,
    open: rows.filter((row) => row.status === "open").length,
    in_progress: rows.filter((row) => row.status === "in_progress").length,
    awaiting_confirmation: rows.filter((row) => row.status === "awaiting_confirmation").length,
    completed: rows.filter((row) => row.status === "completed").length,
    cancelled: rows.filter((row) => row.status === "cancelled").length,
  };
}

function locationLabel(row: ProjectRow) {
  const province = row.provincia_id ? getProvinceById(row.provincia_id)?.name : null;
  const canton = row.canton_id ? getCantonById(row.canton_id)?.name : null;
  return [canton, province].filter(Boolean).join(", ") || null;
}

export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? "25") || 25));
  const db = createAdminClient();

  const rows: ProjectRow[] = [];
  const batchSize = 1000;
  for (let from = 0; from < 10000; from += batchSize) {
    const { data, error } = await db
      .from("projects")
      .select(`
        id, title, description, status, category_id, provincia_id, canton_id,
        budget_min, budget_max, timeline, client_identity_status,
        client_name_snapshot, client_email_snapshot, client_phone_snapshot,
        client_id, accepted_professional_id, created_at, updated_at,
        completed_at, work_done_at, archived_by_client,
        for_someone_else, beneficiary_name, beneficiary_dob,
        profiles:client_id(full_name, email, cedula, avatar_url),
        proposals(id, status, professional_id)
      `)
      .order("created_at", { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) {
      console.error("[admin/projects] list error:", error);
      return NextResponse.json({ error: "No se pudieron cargar los proyectos." }, { status: 500 });
    }

    rows.push(...((data ?? []) as unknown as ProjectRow[]));
    if ((data ?? []).length < batchSize) break;
  }

  const acceptedIds = [...new Set(rows.map((row) => row.accepted_professional_id).filter((id): id is string => !!id))];
  const professionalMap = new Map<string, ProfessionalRow>();
  if (acceptedIds.length > 0) {
    const { data, error } = await db
      .from("professionals")
      .select("id, profile_id, slug, business_name, profiles(full_name, email, avatar_url)")
      .in("id", acceptedIds);
    if (!error) {
      for (const pro of (data ?? []) as unknown as ProfessionalRow[]) professionalMap.set(pro.id, pro);
    }
  }

  const counts = countsFor(rows);
  const queryTokens = normalize(q).split(/\s+/).filter(Boolean);
  const filtered = rows.filter((row) => {
    if (filter !== "all" && row.status !== filter) return false;
    if (queryTokens.length === 0) return true;

    const accepted = row.accepted_professional_id ? professionalMap.get(row.accepted_professional_id) : null;
    const loc = locationLabel(row);
    const haystack = normalize([
      row.id,
      row.title,
      row.description,
      row.category_id,
      row.category_id ? getCategoryLabel(row.category_id) : "",
      loc,
      row.timeline,
      row.status,
      row.client_name_snapshot,
      row.client_email_snapshot,
      row.profiles?.full_name,
      row.profiles?.email,
      row.profiles?.cedula,
      accepted?.business_name,
      accepted?.profiles?.full_name,
      accepted?.profiles?.email,
    ].filter(Boolean).join(" "));
    return queryTokens.every((token) => haystack.includes(token));
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((row) => {
    const accepted = row.accepted_professional_id ? professionalMap.get(row.accepted_professional_id) : null;
    const proposals = row.proposals ?? [];
    return {
      id: row.id,
      title: row.title ?? "Solicitud sin titulo",
      description: row.description,
      status: row.status ?? "open",
      category_id: row.category_id,
      category_label: row.category_id ? getCategoryLabel(row.category_id) : null,
      location_label: locationLabel(row),
      budget_min: row.budget_min,
      budget_max: row.budget_max,
      timeline: row.timeline,
      client_identity_status: row.client_identity_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      work_done_at: row.work_done_at,
      archived_by_client: row.archived_by_client === true,
      for_someone_else: row.for_someone_else === true,
      beneficiary_name: row.beneficiary_name,
      beneficiary_dob: row.beneficiary_dob,
      proposals_count: proposals.length,
      pending_proposals_count: proposals.filter((proposal) => proposal.status === "pending").length,
      accepted_proposals_count: proposals.filter((proposal) => proposal.status === "accepted").length,
      client: {
        id: row.client_id,
        name: row.client_name_snapshot ?? row.profiles?.full_name ?? "Cliente",
        email: row.client_email_snapshot ?? row.profiles?.email ?? null,
        cedula: row.profiles?.cedula ?? null,
        avatar_url: row.profiles?.avatar_url ?? null,
        phone: row.client_phone_snapshot ?? null,
      },
      accepted_professional: accepted
        ? {
            id: accepted.id,
            profile_id: accepted.profile_id,
            slug: accepted.slug,
            name: accepted.business_name || accepted.profiles?.full_name || "Profesional",
            email: accepted.profiles?.email ?? null,
            avatar_url: accepted.profiles?.avatar_url ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({
    projects: items,
    counts,
    pagination: {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
