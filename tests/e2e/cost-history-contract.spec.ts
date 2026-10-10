import { expect, test } from "playwright/test";
import { recordedCostHistory } from "../../src/lib/admin/cost-history";
import { COST_SERVICES } from "../../src/lib/admin/cost-catalog";

const now = new Date("2026-10-10T18:00:00Z");
test("one-off payments stay in their month and accumulate without repeats", () => {
  const history = recordedCostHistory([
    { spentOn: "2026-07-15", amount: 25, currency: "USD" },
    { spentOn: "2026-08-31", amount: 160000, currency: "CRC" },
    { spentOn: "2026-10-01", amount: 20, currency: "USD" },
  ], now);
  expect(history).toEqual([
    { month: "2026-07", usd: 25, crc: 0, cumulativeUsd: 25, cumulativeCrc: 0 },
    { month: "2026-08", usd: 0, crc: 160000, cumulativeUsd: 25, cumulativeCrc: 160000 },
    { month: "2026-09", usd: 0, crc: 0, cumulativeUsd: 25, cumulativeCrc: 160000 },
    { month: "2026-10", usd: 20, crc: 0, cumulativeUsd: 45, cumulativeCrc: 160000 },
  ]);
});
test("future payments are excluded and Costa Rica determines the month", () => {
  expect(recordedCostHistory([{ spentOn: "2026-10-01", amount: 20, currency: "USD" }], new Date("2026-10-01T02:00:00Z")))
    .toEqual([{ month: "2026-09", usd: 0, crc: 0, cumulativeUsd: 0, cumulativeCrc: 0 }]);
});
test("current budget stops Sharon and Meta, keeps Play one-off and AI at twenty", () => {
  expect(COST_SERVICES.find((service) => service.id === "claude")?.monthlyUsd).toBe(20);
  expect(COST_SERVICES.find((service) => service.id === "sharon-content")?.monthlyCrc).toBe(0);
  for (const id of ["meta-ads", "google-play"]) {
    expect(COST_SERVICES.find((service) => service.id === id)?.monthlyUsd).toBe(0);
    expect(COST_SERVICES.find((service) => service.id === id)?.annualUsd).toBe(0);
  }
});
