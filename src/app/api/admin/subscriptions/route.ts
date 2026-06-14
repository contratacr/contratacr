import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import {
  getSubscription, getPayments, activatePaidPeriod, setSubscriptionStatus,
} from "@/lib/payments/subscriptions";
import type { BillingCycle } from "@/lib/payments/config";

// Admin subscription management (admin-only; visible NOW for testing the manual
// SINPE/transfer flow). Independent of PAYMENTS_ENABLED so admin can prepare even
// while the public feature is off. Never exposes anything to regular users.

// GET /api/admin/subscriptions?professionalId=…  → subscription + payment history
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const professionalId = new URL(req.url).searchParams.get("professionalId");
  if (!professionalId) return NextResponse.json({ error: "Falta professionalId" }, { status: 400 });

  const [subscription, payments] = await Promise.all([
    getSubscription(professionalId),
    getPayments(professionalId),
  ]);
  return NextResponse.json({ subscription, payments });
}

// POST /api/admin/subscriptions  → manual actions
//   { professionalId, action: "activate", cycle, amount?, reference?, note?, extend? }
//   { professionalId, action: "deactivate" | "expire" | "cancel" }
export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const professionalId: string | undefined = body?.professionalId;
  const action: string | undefined = body?.action;
  if (!professionalId || !action) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  if (action === "activate") {
    const cycle = (body.cycle === "annual" ? "annual" : "monthly") as BillingCycle;
    const sub = await activatePaidPeriod({
      professionalId,
      cycle,
      method: body.method === "card" ? "card" : "sinpe", // manual flow = SINPE/transfer
      amount: typeof body.amount === "number" ? body.amount : undefined,
      reference: body.reference ?? null,
      note: body.note ?? null,
      recordedBy: admin.id,
      extend: !!body.extend,
    });
    return NextResponse.json({ ok: true, subscription: sub });
  }

  if (action === "deactivate" || action === "expire" || action === "cancel") {
    const status = action === "deactivate" ? "inactive" : action === "expire" ? "expired" : "cancelled";
    await setSubscriptionStatus(professionalId, status);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
