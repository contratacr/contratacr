import { NextResponse } from "next/server";
import { PAYMENTS_ENABLED } from "@/lib/payments/config";
import { getPaymentGateway } from "@/lib/payments/gateway";
import { activatePaidPeriod, setSubscriptionStatus } from "@/lib/payments/subscriptions";

// Payment-gateway webhook (card subscriptions). INERT until a real gateway is
// integrated and PAYMENTS_ENABLED is on: the stub gateway's parseWebhook returns
// null, so nothing is ever recorded today. When wired, the gateway verifies the
// signature in parseWebhook() and this handler records the payment / updates the
// subscription — the single integration point for automatic recurring billing.
export async function POST(req: Request) {
  if (!PAYMENTS_ENABLED) return NextResponse.json({ ok: true, ignored: true });

  const rawBody = await req.text();
  const event = await getPaymentGateway().parseWebhook(req, rawBody);
  if (!event) return NextResponse.json({ ok: true, ignored: true });

  if (event.type === "payment_succeeded" && event.professionalId && event.billingCycle) {
    await activatePaidPeriod({
      professionalId: event.professionalId,
      cycle: event.billingCycle,
      method: "card",
      amount: event.amount ?? undefined,
      gateway: event.gateway ?? null,
      gatewayPaymentId: event.gatewayPaymentId ?? null,
      extend: true,
    });
  } else if (event.type === "subscription_cancelled" && event.professionalId) {
    await setSubscriptionStatus(event.professionalId, "cancelled");
  }

  return NextResponse.json({ ok: true });
}
