export const MAX_MONEY_AMOUNT = 222_222_222;

export function moneyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function clampMoneyDigits(value: unknown) {
  const digits = moneyDigits(value).slice(0, String(MAX_MONEY_AMOUNT).length);
  if (!digits) return "";
  const amount = Number(digits);
  return String(Math.min(amount, MAX_MONEY_AMOUNT));
}

export function parseMoneyAmount(value: unknown) {
  const digits = clampMoneyDigits(value);
  return digits ? Number(digits) : null;
}
