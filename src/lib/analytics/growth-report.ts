import { META_TEST_BUDGET } from "./growth-contract";
export type GrowthRow = { action: string; actor_hash: string; attribution: Record<string,string> | null; status: string; delivery_mode?: string | null };
export function summarizeGrowth(rows: GrowthRow[], recordedAdsUsd: number, month = new Date(Date.now()-6*3600000).toISOString().slice(0,7)) {
  const groups = new Map<string,{ action: string; campaign: string; actions: number; people: Set<string> }>();
  for (const row of rows) {
    const campaign = row.attribution?.campaign || "sin_atribucion";
    const key = JSON.stringify([row.action,campaign]);
    const group = groups.get(key) ?? { action: row.action,campaign,actions: 0,people: new Set<string>() };
    group.actions++; group.people.add(row.actor_hash); groups.set(key,group);
  }
  // October's Ads Manager audit already found spend before the proposed test.
  // A missing ledger entry must not make that consumed budget appear available.
  const auditedAdsUsd = month === "2026-10" ? 9.38 : 0;
  const minimumKnownAdsUsd = Math.max(recordedAdsUsd,auditedAdsUsd);
  const remainingMonthlyUsd = Math.max(0,Math.round((META_TEST_BUDGET.monthlyCeiling-minimumKnownAdsUsd)*100)/100);
  return { budget: META_TEST_BUDGET,recordedAdsUsd,auditedAdsUsd,minimumKnownAdsUsd,remainingMonthlyUsd,
    maximumTestUsd: Math.min(META_TEST_BUDGET.total,remainingMonthlyUsd),
    spendNeedsReconciliation: recordedAdsUsd<auditedAdsUsd,
    overMonthlyCeiling: minimumKnownAdsUsd>META_TEST_BUDGET.monthlyCeiling,
    results: [...groups.values()].map(({ people,...group }) => ({ ...group,people: people.size })),
    productionSent: rows.filter(row => row.status==="sent" && row.delivery_mode==="production").length,
    testSent: rows.filter(row => row.status==="sent" && row.delivery_mode==="test").length,
    delivery: Object.fromEntries(["pending","sending","sent","browser_only","suppressed","expired"].map(status => [status,rows.filter(row => row.status===status).length])),
  };
}
