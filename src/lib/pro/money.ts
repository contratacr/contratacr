import { formatColones } from "@/lib/pricing";
/** Same colón symbol/grouping as the app; retain meaningful cents for stock costs. */
export function proMoney(value: number) {
  const rounded = Math.round(value * 100) / 100;
  const [whole, cents] = rounded.toFixed(2).split(".");
  return formatColones(Number(whole)) + (cents === "00" ? "" : "," + cents);
}
