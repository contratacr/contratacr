/**
 * Ends a sentence with a period unless it already ends with terminal punctuation.
 * Intl formats Spanish times as «6:17 p. m.», so a template like `vence el ${date}.`
 * produced «p. m..». Use this instead of hard-coding the final period after an
 * interpolated date/time (or any value that may already end in «.»).
 */
export function endSentence(text: string): string {
  const trimmed = text.replace(/\s+$/, "");
  return /[.!?…]["»”’)]*$/.test(trimmed) ? trimmed : trimmed + ".";
}
