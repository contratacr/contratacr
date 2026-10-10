type Payment = { spentOn: string; amount: number; currency: "USD" | "CRC" };

/** Actual payments only: changing today's budget cannot rewrite history. */
export function recordedCostHistory(entries: Payment[], today: Date) {
  const current = today.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  const payments = entries.filter((entry) => entry.spentOn <= current);
  const first = payments.reduce((month, entry) => entry.spentOn.slice(0, 7) < month ? entry.spentOn.slice(0, 7) : month, current.slice(0, 7));
  const cursor = new Date(`${first}-01T12:00:00Z`);
  const result = [];
  let cumulativeUsd = 0;
  let cumulativeCrc = 0;
  const round = (value: number) => Math.round(value * 100) / 100;
  while (cursor.toISOString().slice(0, 7) <= current.slice(0, 7)) {
    const month = cursor.toISOString().slice(0, 7);
    const own = payments.filter((entry) => entry.spentOn.startsWith(month));
    const usd = round(own.filter((entry) => entry.currency === "USD").reduce((total, entry) => total + entry.amount, 0));
    const crc = round(own.filter((entry) => entry.currency === "CRC").reduce((total, entry) => total + entry.amount, 0));
    cumulativeUsd = round(cumulativeUsd + usd);
    cumulativeCrc = round(cumulativeCrc + crc);
    result.push({ month, usd, crc, cumulativeUsd, cumulativeCrc });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}
