import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { auditUserAction } from "@/lib/audit/user-action";
import { writeSourceColumns } from "@/lib/security/write-guard";

// POST /api/report-professional — a client reports a professional (two-way
// reputation): no-show, service not performed, etc. No monetary penalty (payments
// are off-platform); enforcement is reputation-based. Records the report, bumps
// the pro's flag_count, and flags past a threshold (surfaces to admin moderation).
const FLAG_THRESHOLD = 3;

export async function POST(req: Request) {
  const rl = enforceRateLimit(req, "report", 10, 60_000);
  if (rl) return rl;
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { bookingId, professionalId, reason } = await req.json();
  if (!reason || (!bookingId && !professionalId)) {
    return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the reported professional (and verify the booking belongs to the client).
  let targetProId: string | null = professionalId ?? null;
  let proName: string | null = null;
  let proSlug: string | null = null;
  if (bookingId) {
    const { data: booking } = await admin
      .from("bookings")
      .select("professional_id, client_id, professionals(slug, profiles(full_name))")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking || booking.client_id !== user.id) {
      return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
    }
    targetProId = booking.professional_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pro = booking.professionals as any;
    proName = pro?.profiles?.full_name ?? null;
    proSlug = pro?.slug ?? null;
  }
  if (!targetProId) return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });

  let { data: reportRow, error: reportError } = await admin.from("reports").insert({
    professional_id: targetProId,
    professional_name: proName,
    professional_slug: proSlug,
    reason,
    reporter_email: user.email ?? null,
    ...writeSourceColumns(req),
  }).select("id").single();
  if (reportError && /created_source|created_app|created_supabase|column|schema cache|PGRST204|could not find/i.test(reportError.message)) {
    ({ data: reportRow, error: reportError } = await admin.from("reports").insert({
      professional_id: targetProId,
      professional_name: proName,
      professional_slug: proSlug,
      reason,
      reporter_email: user.email ?? null,
    }).select("id").single());
  }
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });

  await auditUserAction(admin, req, {
    actorUserId: user.id,
    actorRole: "client",
    action: "report.professional",
    entityTable: "reports",
    entityId: reportRow?.id ?? null,
    entityOwnerUserId: user.id,
    afterData: {
      professional_id: targetProId,
      professional_name: proName,
      professional_slug: proSlug,
      booking_id: bookingId ?? null,
      reason,
    },
  });

  const { data: pro } = await admin
    .from("professionals")
    .select("flag_count")
    .eq("id", targetProId)
    .maybeSingle();
  const next = (pro?.flag_count ?? 0) + 1;
  await admin
    .from("professionals")
    .update({ flag_count: next, is_flagged: next >= FLAG_THRESHOLD })
    .eq("id", targetProId);

  return NextResponse.json({ ok: true });
}
