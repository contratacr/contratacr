import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = 20;
  const db = createAdminClient();
  const { data, error } = await db.rpc("get_admin_professional_interactions", {
    p_search: query,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) {
    console.error("[admin/analytics/professionals]", error);
    return NextResponse.json({ error: "No se pudo cargar la analítica por profesional." }, { status: 500 });
  }

  const payload = (data ?? {}) as { total?: number; items?: unknown[] };
  const total = Number(payload.total) || 0;
  return NextResponse.json({
    items: Array.isArray(payload.items) ? payload.items : [],
    pagination: {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
