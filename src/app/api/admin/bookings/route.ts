import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";

type BookingRow = {
  id: string;
  professional_id: string | null;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_cedula: string | null;
  service_description: string | null;
  preferred_date_text: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string | null;
  category_id: string | null;
  slot_location_label: string | null;
  created_at: string;
  updated_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  archived_by_client: boolean | null;
  archived_by_professional: boolean | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
    cedula: string | null;
    avatar_url: string | null;
  } | null;
  professionals?: {
    id: string;
    profile_id: string | null;
    slug: string | null;
    business_name: string | null;
    category_id: string | null;
    profiles?: {
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
};

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "rescheduled", "in_progress"]);

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesFilter(status: string | null, filter: string) {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE_STATUSES.has(status ?? "");
  return status === filter;
}

function countsFor(rows: BookingRow[]) {
  return {
    all: rows.length,
    active: rows.filter((row) => matchesFilter(row.status, "active")).length,
    awaiting_confirmation: rows.filter((row) => row.status === "awaiting_confirmation").length,
    completed: rows.filter((row) => row.status === "completed").length,
    cancelled: rows.filter((row) => row.status === "cancelled").length,
  };
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

  const rows: BookingRow[] = [];
  const batchSize = 1000;
  for (let from = 0; from < 10000; from += batchSize) {
    const { data, error } = await db
      .from("bookings")
      .select(`
        id, professional_id, client_id, client_name, client_email, client_phone, client_cedula,
        service_description, preferred_date_text, scheduled_date, scheduled_time, status, category_id,
        slot_location_label, created_at, updated_at, cancelled_by, cancel_reason,
        archived_by_client, archived_by_professional,
        profiles:client_id(full_name, email, cedula, avatar_url),
        professionals:professional_id(id, profile_id, slug, business_name, category_id, profiles(full_name, email, avatar_url))
      `)
      .order("created_at", { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) {
      console.error("[admin/bookings] list error:", error);
      return NextResponse.json({ error: "No se pudo cargar solicitudes." }, { status: 500 });
    }

    rows.push(...((data ?? []) as unknown as BookingRow[]));
    if ((data ?? []).length < batchSize) break;
  }

  const counts = countsFor(rows);
  const queryTokens = normalize(q).split(/\s+/).filter(Boolean);
  const filtered = rows.filter((row) => {
    if (!matchesFilter(row.status, filter)) return false;
    if (queryTokens.length === 0) return true;

    const pro = row.professionals;
    const haystack = normalize([
      row.id,
      row.service_description,
      row.category_id,
      row.category_id ? getCategoryLabel(row.category_id) : "",
      row.client_name,
      row.client_email,
      row.client_cedula,
      row.profiles?.full_name,
      row.profiles?.email,
      row.profiles?.cedula,
      pro?.business_name,
      pro?.profiles?.full_name,
      pro?.profiles?.email,
      row.slot_location_label,
      row.status,
    ].filter(Boolean).join(" "));
    return queryTokens.every((token) => haystack.includes(token));
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((row) => {
    const pro = row.professionals ?? null;
    return {
      id: row.id,
      status: row.status ?? "confirmed",
      created_at: row.created_at,
      updated_at: row.updated_at,
      scheduled_date: row.scheduled_date,
      scheduled_time: row.scheduled_time,
      preferred_date_text: row.preferred_date_text,
      service_description: row.service_description,
      category_id: row.category_id,
      category_label: row.category_id ? getCategoryLabel(row.category_id) : null,
      slot_location_label: row.slot_location_label,
      cancel_reason: row.cancel_reason,
      cancelled_by: row.cancelled_by,
      archived_by_client: row.archived_by_client === true,
      archived_by_professional: row.archived_by_professional === true,
      client: {
        id: row.client_id,
        name: row.profiles?.full_name ?? row.client_name ?? "Cliente",
        email: row.profiles?.email ?? row.client_email,
        cedula: row.profiles?.cedula ?? row.client_cedula,
        avatar_url: row.profiles?.avatar_url,
        phone: row.client_phone,
      },
      professional: pro
        ? {
            id: pro.id,
            profile_id: pro.profile_id,
            slug: pro.slug,
            name: pro.business_name || pro.profiles?.full_name || "Profesional",
            email: pro.profiles?.email ?? null,
            avatar_url: pro.profiles?.avatar_url ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({
    bookings: items,
    counts,
    pagination: {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
