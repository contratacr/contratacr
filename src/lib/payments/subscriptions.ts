// ─── Subscription backend logic (server-only) ─────────────────────────────────
// Pure-ish helpers + DB operations for professional subscriptions. SERVER ONLY:
// every write uses the service-role admin client and is reached only through
// admin APIs or (later) gateway webhooks. None of this is user-facing until the
// PAYMENTS_ENABLED flag is on; the data model exists regardless so admin can test.
// SERVER-ONLY by construction: it imports the service-role admin client, so it
// must only ever be imported from server code (API routes / server components).

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CYCLE_MONTHS, PRICES, type BillingCycle, type PaymentMethod,
  type PaymentGatewayId, type SubscriptionStatus,
} from "./config";

export type SubscriptionRow = {
  id: string;
  professional_id: string;
  plan: "free" | "premium";
  status: SubscriptionStatus;
  billing_cycle: BillingCycle | null;
  price_paid: number | null;
  payment_method: PaymentMethod | null;
  started_at: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  gateway: Exclude<PaymentGatewayId, null> | null;
  gateway_customer_id: string | null;
  gateway_subscription_id: string | null;
  card_last4: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  subscription_id: string | null;
  professional_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: string;
  billing_cycle: BillingCycle | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string;
  reference: string | null;
  recorded_by: string | null;
  note: string | null;
  gateway: string | null;
  gateway_payment_id: string | null;
  created_at: string;
};

// ── Pure helpers (no DB) ───────────────────────────────────────────────────────

/** A subscription grants premium access when it's active AND not past its period. */
export function isSubscriptionActive(sub?: Pick<SubscriptionRow, "status" | "current_period_end"> | null): boolean {
  if (!sub) return false;
  if (sub.status !== "active") return false;
  if (!sub.current_period_end) return false;
  return new Date(sub.current_period_end).getTime() > Date.now();
}

/** Add a billing cycle to a start date → the renewal/expiry date. */
export function computePeriodEnd(start: Date, cycle: BillingCycle): Date {
  const end = new Date(start);
  end.setMonth(end.getMonth() + CYCLE_MONTHS[cycle]);
  return end;
}

/** Price for a cycle (₡). Falls back to the monthly price. */
export function priceForCycle(cycle: BillingCycle): number {
  return PRICES[cycle] ?? PRICES.monthly;
}

// ── DB operations (service-role) ───────────────────────────────────────────────

/** The professional's subscription row, or null when they've never had one. */
export async function getSubscription(professionalId: string): Promise<SubscriptionRow | null> {
  const db = createAdminClient();
  const { data } = await db.from("subscriptions").select("*").eq("professional_id", professionalId).maybeSingle();
  return (data as SubscriptionRow) ?? null;
}

/** Full payment history (newest first). */
export async function getPayments(professionalId: string): Promise<PaymentRow[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("subscription_payments")
    .select("*")
    .eq("professional_id", professionalId)
    .order("paid_at", { ascending: false });
  return (data as PaymentRow[]) ?? [];
}

/** Ensure a (free/inactive) subscription row exists; returns it. */
export async function ensureSubscription(professionalId: string): Promise<SubscriptionRow> {
  const existing = await getSubscription(professionalId);
  if (existing) return existing;
  const db = createAdminClient();
  const { data } = await db
    .from("subscriptions")
    .insert({ professional_id: professionalId, plan: "free", status: "inactive" })
    .select("*")
    .single();
  return data as SubscriptionRow;
}

type ActivateInput = {
  professionalId: string;
  cycle: BillingCycle;
  method: PaymentMethod;          // 'sinpe' | 'manual' | 'card'
  amount?: number;                // defaults to the cycle price
  reference?: string | null;      // SINPE/transfer reference
  recordedBy?: string | null;     // admin id (manual flow)
  note?: string | null;
  gateway?: Exclude<PaymentGatewayId, null> | null;
  gatewayPaymentId?: string | null;
  // Extend from the current period end when still active (renewals stack), else now.
  extend?: boolean;
};

/**
 * Activate (or extend) premium and record the payment in ONE place — used by the
 * manual SINPE/transfer admin flow today and by the gateway webhook later. Always
 * writes a payment ledger row + sets the subscription active with a fresh period.
 */
export async function activatePaidPeriod(input: ActivateInput): Promise<SubscriptionRow> {
  const db = createAdminClient();
  const sub = await ensureSubscription(input.professionalId);

  const now = new Date();
  const base = input.extend && isSubscriptionActive(sub) && sub.current_period_end
    ? new Date(sub.current_period_end)
    : now;
  const periodEnd = computePeriodEnd(base, input.cycle);
  const amount = input.amount ?? priceForCycle(input.cycle);

  await db.from("subscription_payments").insert({
    subscription_id: sub.id,
    professional_id: input.professionalId,
    amount,
    currency: "CRC",
    method: input.method,
    status: "paid",
    billing_cycle: input.cycle,
    period_start: base.toISOString(),
    period_end: periodEnd.toISOString(),
    paid_at: now.toISOString(),
    reference: input.reference ?? null,
    recorded_by: input.recordedBy ?? null,
    note: input.note ?? null,
    gateway: input.gateway ?? null,
    gateway_payment_id: input.gatewayPaymentId ?? null,
  });

  const { data } = await db
    .from("subscriptions")
    .update({
      plan: "premium",
      status: "active",
      billing_cycle: input.cycle,
      price_paid: amount,
      payment_method: input.method,
      started_at: sub.started_at ?? now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at: null,
      gateway: input.gateway ?? sub.gateway ?? null,
      updated_at: now.toISOString(),
    })
    .eq("id", sub.id)
    .select("*")
    .single();

  return data as SubscriptionRow;
}

/** Mark a subscription inactive/expired/cancelled (admin or expiry sweep). */
export async function setSubscriptionStatus(
  professionalId: string,
  status: Extract<SubscriptionStatus, "inactive" | "expired" | "cancelled">,
): Promise<void> {
  const db = createAdminClient();
  await db
    .from("subscriptions")
    .update({ status, plan: "free", updated_at: new Date().toISOString() })
    .eq("professional_id", professionalId);
}
