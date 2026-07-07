import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { auditUserAction } from "@/lib/audit/user-action";
import { writeSourceColumns } from "@/lib/security/write-guard";

// POST /api/report-client — a professional reports a client (two-way reputation).
// Records the report, bumps the client's flag_count, and flags the client when it
// crosses a threshold (surfaces to the pro before accepting + to admin moderation).
const FLAG_THRESHOLD = 3;

export async function POST(req: Request) {
  const rl = enforceRateLimit(req, "report", 10, 60_000);
  if (rl) return rl;
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { bookingId, clientId, reason } = await req.json();
  if (!reason || (!bookingId && !clientId)) {
    return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const admin = createAdminClient();

  // The reporter must be a professional.
  const { data: pro } = await admin
    .from("professionals")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!pro) return NextResponse.json({ error: "Solo profesionales pueden reportar clientes." }, { status: 403 });

  // Resolve the reported client from the booking when only bookingId is given.
  let targetClientId: string | null = clientId ?? null;
  let clientName: string | null = null;
  if (bookingId) {
    const { data: booking } = await admin
      .from("bookings")
      .select("client_id, client_name, professional_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking || booking.professional_id !== pro.id) {
      return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
    }
    targetClientId = booking.client_id ?? null;
    clientName = booking.client_name ?? null;
  }

  let { data: reportRow, error: reportError } = await admin.from("reports").insert({
    reported_client_id: targetClientId,
    reporter_professional_id: pro.id,
    professional_name: clientName ? `Cliente: ${clientName}` : "Cliente",
    reason,
    ...writeSourceColumns(req),
  }).select("id").single();
  if (reportError && /created_source|created_app|created_supabase|column|schema cache|PGRST204|could not find/i.test(reportError.message)) {
    ({ data: reportRow, error: reportError } = await admin.from("reports").insert({
      reported_client_id: targetClientId,
      reporter_professional_id: pro.id,
      professional_name: clientName ? `Cliente: ${clientName}` : "Cliente",
      reason,
    }).select("id").single());
  }
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });

  await auditUserAction(admin, req, {
    actorUserId: user.id,
    actorRole: "professional",
    action: "report.client",
    entityTable: "reports",
    entityId: reportRow?.id ?? null,
    entityOwnerUserId: targetClientId,
    afterData: {
      reported_client_id: targetClientId,
      reporter_professional_id: pro.id,
      booking_id: bookingId ?? null,
      reason,
    },
  });

  // Bump the flag count and flag the client past the threshold.
  if (targetClientId) {
    const { data: prof } = await admin
      .from("profiles")
      .select("flag_count")
      .eq("id", targetClientId)
      .maybeSingle();
    const next = (prof?.flag_count ?? 0) + 1;
    await admin
      .from("profiles")
      .update({ flag_count: next, is_flagged: next >= FLAG_THRESHOLD })
      .eq("id", targetClientId);
  }

  return NextResponse.json({ ok: true });
}
