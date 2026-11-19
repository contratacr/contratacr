// Run: node --test scripts/directory/finance-calc.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
const { frenchAmortization, FINANCE_DISCLAIMER } = await import("../../src/lib/directory/finance-calc.ts");

const ok = (input) => {
  const r = frenchAmortization(input);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};

test("textbook case: 10 000 000 at 12 % for 12 months", () => {
  // 1 000 000.00 (minor) at 1 % monthly, 12 periods → 88 848.79 per month.
  const v = ok({ priceMinor: 100_000_000, downPaymentMinor: 0, annualRatePct: 12, termMonths: 12 });
  assert.equal(v.monthlyPaymentMinor, 8_884_879);
  assert.equal(v.principalMinor, 100_000_000);
  assert.ok(Math.abs(v.lastPaymentMinor - v.monthlyPaymentMinor) <= 12, "last payment only absorbs rounding");
  assert.equal(v.totalPaidMinor, v.principalMinor + v.totalInterestMinor);
});

test("down payment reduces the principal", () => {
  const v = ok({ priceMinor: 2_000_000_000, downPaymentMinor: 500_000_000, annualRatePct: 9.5, termMonths: 72 });
  assert.equal(v.principalMinor, 1_500_000_000);
  assert.equal(v.termMonths, 72);
  assert.ok(v.totalInterestMinor > 0);
  assert.equal(v.totalPaidMinor, v.principalMinor + v.totalInterestMinor);
});

test("zero rate splits the principal evenly", () => {
  const v = ok({ priceMinor: 1_000_000, downPaymentMinor: 0, annualRatePct: 0, termMonths: 3 });
  assert.equal(v.monthlyPaymentMinor, 333_333);
  assert.equal(v.lastPaymentMinor, 333_334);
  assert.equal(v.totalInterestMinor, 0);
  assert.equal(v.totalPaidMinor, 1_000_000);
});

test("single month pays principal plus one month of interest", () => {
  const v = ok({ priceMinor: 1_200_000, downPaymentMinor: 0, annualRatePct: 12, termMonths: 1 });
  assert.equal(v.monthlyPaymentMinor, 1_212_000);
  assert.equal(v.lastPaymentMinor, 1_212_000);
  assert.equal(v.totalInterestMinor, 12_000);
});

test("longer term → lower payment, more interest", () => {
  const base = { priceMinor: 50_000_000, downPaymentMinor: 0, annualRatePct: 10 };
  const a = ok({ ...base, termMonths: 36 }), b = ok({ ...base, termMonths: 84 });
  assert.ok(b.monthlyPaymentMinor < a.monthlyPaymentMinor);
  assert.ok(b.totalInterestMinor > a.totalInterestMinor);
});

test("invalid inputs return error codes, never throw", () => {
  const good = { priceMinor: 1_000_000, downPaymentMinor: 0, annualRatePct: 10, termMonths: 12 };
  const cases = [
    [{ priceMinor: 0 }, "invalid_price"],
    [{ priceMinor: 1.5 }, "invalid_price"],
    [{ downPaymentMinor: -1 }, "invalid_down_payment"],
    [{ downPaymentMinor: 1_000_000 }, "invalid_down_payment"],
    [{ annualRatePct: -0.1 }, "invalid_rate"],
    [{ annualRatePct: 61 }, "invalid_rate"],
    [{ annualRatePct: Number.NaN }, "invalid_rate"],
    [{ termMonths: 0 }, "invalid_term"],
    [{ termMonths: 121 }, "invalid_term"],
    [{ termMonths: 12.5 }, "invalid_term"],
  ];
  for (const [patch, error] of cases) assert.deepEqual(frenchAmortization({ ...good, ...patch }), { ok: false, error });
});

test("disclaimer exists in both languages", () => {
  assert.match(FINANCE_DISCLAIMER.es, /No es una oferta/);
  assert.match(FINANCE_DISCLAIMER.en, /not a credit offer/);
});
