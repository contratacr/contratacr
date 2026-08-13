import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";
import { repairVisibleText } from "@/lib/text/repair-visible-text";

const BOOKING_CONNECTION_STATUSES = ["confirmed", "in_progress", "awaiting_confirmation", "completed"];
const PROJECT_CONNECTION_STATUSES = ["in_progress", "awaiting_confirmation", "completed"];

type Connection = {
  professionalId: string;
  slug: string | null;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
  categoryId: string | null;
  categoryLabel: string | null;
  lastInteractionAt: string | null;
  source: "booking" | "project" | "both";
  status: string;
  title: string | null;
  count: number;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const [bookingsResult, projectsResult] = await Promise.all([
    admin
      .from("bookings")
      .select("id, professional_id, status, service_description, category_id, scheduled_date, created_at, updated_at")
      .eq("client_id", user.id)
      .in("status", BOOKING_CONNECTION_STATUSES),
    admin
      .from("projects")
      .select("id, accepted_professional_id, status, title, category_id, created_at, updated_at, completed_at, work_done_at")
      .eq("client_id", user.id)
      .in("status", PROJECT_CONNECTION_STATUSES)
      .not("accepted_professional_id", "is", null),
  ]);

  if (bookingsResult.error) {
    console.error("[GET /api/client/connections] bookings:", bookingsResult.error.message);
    return NextResponse.json({ error: bookingsResult.error.message, connections: [] }, { status: 500 });
  }
  if (projectsResult.error) {
    console.error("[GET /api/client/connections] projects:", projectsResult.error.message);
    return NextResponse.json({ error: projectsResult.error.message, connections: [] }, { status: 500 });
  }

  const rows = [
    ...((bookingsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      professionalId: String(row.professional_id ?? ""),
      source: "booking" as const,
      status: String(row.status ?? ""),
      title: repairVisibleText(String(row.service_description || "")) || null,
      categoryId: row.category_id ? String(row.category_id) : null,
      date: String(row.updated_at || row.scheduled_date || row.created_at || ""),
    })),
    ...((projectsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      professionalId: String(row.accepted_professional_id ?? ""),
      source: "project" as const,
      status: String(row.status ?? ""),
      title: repairVisibleText(String(row.title || "")) || null,
      categoryId: row.category_id ? String(row.category_id) : null,
      date: String(row.completed_at || row.work_done_at || row.updated_at || row.created_at || ""),
    })),
  ].filter((row) => row.professionalId);

  const professionalIds = [...new Set(rows.map((row) => row.professionalId))];
  if (professionalIds.length === 0) return NextResponse.json({ connections: [] });

  const { data: professionals, error: professionalsError } = await admin
    .from("professionals")
    .select("id, slug, business_name, category_id, verification_status, profiles(full_name, avatar_url)")
    .in("id", professionalIds);
  if (professionalsError) {
    console.error("[GET /api/client/connections] professionals:", professionalsError.message);
    return NextResponse.json({ error: professionalsError.message, connections: [] }, { status: 500 });
  }

  const professionalMap = new Map((professionals ?? []).map((pro) => [String(pro.id), pro as Record<string, unknown>]));
  const grouped = new Map<string, Connection>();

  for (const row of rows) {
    const pro = professionalMap.get(row.professionalId);
    if (!pro) continue;
    const profile = pro.profiles as { full_name?: string | null; avatar_url?: string | null } | null;
    const existing = grouped.get(row.professionalId);
    const currentTime = row.date ? new Date(row.date).getTime() : 0;
    const previousTime = existing?.lastInteractionAt ? new Date(existing.lastInteractionAt).getTime() : 0;
    const categoryId = row.categoryId || (pro.category_id ? String(pro.category_id) : null);
    const connection: Connection = existing ?? {
      professionalId: row.professionalId,
      slug: pro.slug ? String(pro.slug) : null,
      name: repairVisibleText(String(pro.business_name || profile?.full_name || "Profesional")),
      avatarUrl: profile?.avatar_url ?? null,
      isVerified: pro.verification_status === "verified",
      categoryId,
      categoryLabel: categoryId ? getCategoryLabel(categoryId, "es") : null,
      lastInteractionAt: row.date || null,
      source: row.source,
      status: row.status,
      title: row.title,
      count: 0,
    };

    connection.count += 1;
    connection.source = connection.source === row.source ? connection.source : "both";
    if (!connection.categoryId && categoryId) connection.categoryId = categoryId;
    if (!connection.categoryLabel && categoryId) connection.categoryLabel = getCategoryLabel(categoryId, "es");
    if (currentTime >= previousTime) {
      connection.lastInteractionAt = row.date || connection.lastInteractionAt;
      connection.status = row.status;
      connection.title = row.title || connection.title;
    }
    grouped.set(row.professionalId, connection);
  }

  const connections = [...grouped.values()].sort((a, b) => {
    const ad = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
    const bd = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
    return bd - ad;
  });

  return NextResponse.json({ connections });
}
