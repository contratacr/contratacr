import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApiAdmin } from "@/lib/auth/admin";
import { PAYMENTS_ENABLED, type BillingCycle } from "@/lib/payments/config";
import { submitManualPayment } from "@/lib/payments/subscriptions";

// A professional submits a SINPE/transfer payment with a comprobante (receipt URL
// from /api/payments/receipt) for admin review. Creates a PENDING payment — it
// grants nothing until an admin approves it. Gated like the rest of payments.
export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const admin = await getApiAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!PAYMENTS_ENABLED && !admin) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const db = createAdminClient();
  const { data: pro } = await db.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!pro) return NextResponse.json({ error: "Solo profesionales pueden suscribirse." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const cycle = (body?.cycle === "annual" ? "annual" : "monthly") as BillingCycle;
  const receiptUrl: string | undefined = body?.receiptUrl;
  if (!receiptUrl) return NextResponse.json({ error: "Falta el comprobante" }, { status: 400 });

  const payment = await submitManualPayment({
    professionalId: pro.id as string,
    cycle,
    receiptUrl,
    reference: body?.reference ?? null,
  });
  return NextResponse.json({ ok: true, payment });
}
