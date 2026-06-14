import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import {
  getSubscription, getPayments, activatePaidPeriod, setSubscriptionStatus, deleteSubscription,
  listPendingPayments, approveManualPayment, rejectManualPayment,
} from "@/lib/payments/subscriptions";
import type { BillingCycle } from "@/lib/payments/config";

// Admin subscription management (admin-only; visible NOW for testing the manual
// SINPE/transfer flow). Independent of PAYMENTS_ENABLED so admin can prepare even
// while the public feature is off. Never exposes anything to regular users.

// GET /api/admin/subscriptions?professionalId=…  → subscription + payment history
// GET /api/admin/subscriptions?pending=1          → manual payments awaiting review
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(req.url);
  if (url.searchParams.get("pending") === "1") {
    return NextResponse.json({ pending: await listPendingPayments() });
  }

  const professionalId = url.searchParams.get("professionalId");
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

  // Reset = hard-delete the subscription + its payments (no leftover preview data).
  if (action === "reset") {
    await deleteSubscription(professionalId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

// PATCH /api/admin/subscriptions → review a pending manual payment.
//   { paymentId, action: "approve" }            → activates the paid period
//   { paymentId, action: "reject", note? }      → rejects it (kept in history)
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const paymentId: string | undefined = body?.paymentId;
  const action: string | undefined = body?.action;
  if (!paymentId || !action) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  if (action === "approve") {
    const sub = await approveManualPayment(paymentId, admin.id);
    if (!sub) return NextResponse.json({ error: "El pago no está pendiente" }, { status: 400 });
    return NextResponse.json({ ok: true, subscription: sub });
  }
  if (action === "reject") {
    await rejectManualPayment(paymentId, admin.id, body?.note ?? null);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
