// ─── Professional subscriptions — central config + GLOBAL feature flag ────────
//
// EVERYTHING about paid subscriptions is gated behind PAYMENTS_ENABLED. While it
// is FALSE (the default), regular users see ZERO payment/subscription UI and the
// app behaves exactly like the current free version. Admin-only management views
// are the single exception (they're for testing and are never shown to normal
// users). To activate later: plug a real gateway, update the legal pages, set
// NEXT_PUBLIC_PAYMENTS_ENABLED=true. Nothing here charges anyone until then.
//
// The flag is read from an env var so it can be flipped without a code change,
// and it is NEXT_PUBLIC_ so the same value is available on the client (to hide
// the UI) and the server (to gate the logic/APIs). Defaults to OFF.

export const PAYMENTS_ENABLED: boolean =
  process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

// ─── Plans ────────────────────────────────────────────────────────────────────
// One paid tier ("premium") plus the implicit "free" tier everyone is on today.
// Prices are in Costa Rican colones (₡), stored as integers (no decimals).
export type PlanId = "free" | "premium";
export type BillingCycle = "monthly" | "annual";

export const PRICES: Record<BillingCycle, number> = {
  monthly: 3000,   // ₡3.000 / mes
  annual: 30000,   // ₡30.000 / año (≈ 2 meses gratis vs mensual)
};

/** Whole months a cycle covers — used to compute renewal/expiry dates. */
export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  annual: 12,
};

export const CURRENCY = "CRC";

// Manual SINPE Móvil / transfer destination shown to pros for the manual flow.
// PLACEHOLDER — set the real SINPE number + holder name before activating.
export const SINPE_PAYMENT = {
  number: "0000-0000",
  holder: "ContrataCR",
};

/** Display helper (₡3.000). Kept here so UI + admin format prices identically. */
export function formatColones(amount: number): string {
  return `₡${amount.toLocaleString("es-CR")}`;
}

// ─── Subscription status / payment vocab (mirrors the DB CHECK constraints) ────
export type SubscriptionStatus = "active" | "inactive" | "expired" | "pending" | "cancelled";
export type PaymentMethod = "card" | "sinpe" | "manual";
export type PaymentStatus = "paid" | "pending" | "failed" | "refunded";

// Which gateway a card subscription is (or will be) billed through. `null` until a
// real gateway is plugged in; SINPE/manual payments never use a gateway.
export type PaymentGatewayId = "onvo" | "tilopay" | null;
