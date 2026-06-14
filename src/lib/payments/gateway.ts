// ─── Payment gateway abstraction (STUB — no live integration yet) ─────────────
//
// Card subscriptions will be billed through a Costa Rican gateway (ONVO Pay or
// Tilopay). We code against THIS interface only, so the real provider is plugged
// in later WITHOUT touching callers. Nothing here processes a real payment today.
//
// HARD RULE: raw card data NEVER touches our server or DB. The gateway hosts the
// card form (hosted checkout / tokenization); we only ever receive references
// (customer id, subscription id, payment id, last4). Do not add card fields here.
//
// ── To activate later ────────────────────────────────────────────────────────
//   1. Pick the provider, set its secret key in env (e.g. ONVO_SECRET_KEY).
//   2. Implement createCustomer / createSubscriptionCheckout / cancelSubscription
//      and parseWebhook against the provider's API (replace the stub throws).
//   3. Wire the webhook route (/api/payments/webhook) to verify the signature and
//      call recordGatewayPayment() (see subscriptions.ts).
//   4. Flip NEXT_PUBLIC_PAYMENTS_ENABLED=true.

import type { BillingCycle, PaymentGatewayId } from "./config";

export interface CheckoutSession {
  /** URL to redirect the professional to the gateway's hosted card form. */
  url: string;
  /** Provider-side id for reconciliation. */
  reference: string;
}

export interface GatewayPaymentEvent {
  type: "payment_succeeded" | "payment_failed" | "subscription_cancelled";
  professionalId: string | null;
  gateway: PaymentGatewayId;
  gatewayCustomerId?: string | null;
  gatewaySubscriptionId?: string | null;
  gatewayPaymentId?: string | null;
  amount?: number | null;
  billingCycle?: BillingCycle | null;
  cardLast4?: string | null;
}

export interface PaymentGateway {
  readonly id: PaymentGatewayId;
  /** Create (or fetch) the gateway customer for a professional. */
  createCustomer(input: { professionalId: string; email: string; name: string }): Promise<{ customerId: string }>;
  /** Start a hosted, recurring card subscription checkout. */
  createSubscriptionCheckout(input: {
    professionalId: string;
    customerId: string;
    cycle: BillingCycle;
    returnUrl: string;
  }): Promise<CheckoutSession>;
  /** Cancel an active card subscription at the gateway. */
  cancelSubscription(gatewaySubscriptionId: string): Promise<void>;
  /** Verify + parse a webhook payload into a normalized event. */
  parseWebhook(req: Request, rawBody: string): Promise<GatewayPaymentEvent | null>;
}

// ── Stub provider — every method makes it obvious integration is pending ───────
const NOT_INTEGRATED =
  "Payment gateway not integrated yet. Set the provider key and implement gateway.ts before enabling PAYMENTS_ENABLED.";

class StubGateway implements PaymentGateway {
  readonly id: PaymentGatewayId = null;
  async createCustomer(): Promise<{ customerId: string }> { throw new Error(NOT_INTEGRATED); }
  async createSubscriptionCheckout(): Promise<CheckoutSession> { throw new Error(NOT_INTEGRATED); }
  async cancelSubscription(): Promise<void> { throw new Error(NOT_INTEGRATED); }
  async parseWebhook(): Promise<GatewayPaymentEvent | null> { return null; }
}

// Swap the implementation here when a provider is ready (e.g. new OnvoGateway()).
let _gateway: PaymentGateway | null = null;
export function getPaymentGateway(): PaymentGateway {
  if (!_gateway) _gateway = new StubGateway();
  return _gateway;
}

/** True once a real (non-stub) gateway is wired. Card checkout stays hidden until then. */
export function isGatewayIntegrated(): boolean {
  return getPaymentGateway().id !== null;
}
