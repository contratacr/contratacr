import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscription, getPayments } from "@/lib/payments/subscriptions";
import { PAYMENTS_ENABLED } from "@/lib/payments/config";
import { getPaymentGateway, isGatewayIntegrated } from "@/lib/payments/gateway";

// Professional self-service subscription endpoint. EVERYTHING here is gated by
// PAYMENTS_ENABLED: while it's off, the pro UI is hidden and this route reports
// { enabled: false } and refuses to start any checkout — the app stays free.

async function resolveProfessional() {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) return null;
  const db = createAdminClient();
  const { data } = await db.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!data) return null;
  return { userId: user.id, professionalId: data.id as string };
}

// GET → the caller's own subscription + payment history (or enabled:false).
export async function GET() {
  if (!PAYMENTS_ENABLED) return NextResponse.json({ enabled: false, subscription: null, payments: [] });

  const me = await resolveProfessional();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const [subscription, payments] = await Promise.all([
    getSubscription(me.professionalId),
    getPayments(me.professionalId),
  ]);
  return NextResponse.json({ enabled: true, gatewayReady: isGatewayIntegrated(), subscription, payments });
}

// POST → start a recurring CARD checkout (gateway-hosted). Inert until the flag is
// on AND a real gateway is integrated; SINPE is handled manually by an admin.
export async function POST() {
  if (!PAYMENTS_ENABLED) return NextResponse.json({ error: "Pagos no disponibles" }, { status: 404 });

  const me = await resolveProfessional();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  if (!isGatewayIntegrated()) {
    // Card path not wired yet — the UI should fall back to the SINPE instructions.
    return NextResponse.json({ error: "Pago con tarjeta no disponible todavía" }, { status: 501 });
  }

  // Integration point: create the customer + hosted checkout, return its URL.
  void getPaymentGateway();
  return NextResponse.json({ error: "No implementado" }, { status: 501 });
}
