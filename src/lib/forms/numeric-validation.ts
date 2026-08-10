export { MAX_MONEY_AMOUNT } from "@/lib/money-limits";
export const MAX_OFFER_QUANTITY = 1_000_000;

export function parseOptionalWholeNumber(value: FormDataEntryValue | null) {
  const digits = String(value ?? "").replace(/\D/gu, "");
  return digits ? Number(digits) : null;
}

export function isWholeNumberInRange(value: number | null, min: number, max: number) {
  return value == null || (Number.isSafeInteger(value) && value >= min && value <= max);
}

export function isNumericDatabaseRangeError(message: string) {
  const normalized = message.toLocaleLowerCase("en-US");
  return normalized.includes("out of range")
    || normalized.includes("numeric field overflow")
    || normalized.includes("smallint")
    || normalized.includes("integer");
}

export function formatNumberForMessage(value: number) {
  return new Intl.NumberFormat("es-CR").format(value);
}
