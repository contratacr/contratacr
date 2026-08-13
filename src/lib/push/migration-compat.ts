type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function errorText(error: PostgrestErrorLike) {
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

export function isMissingPushRpc(error: PostgrestErrorLike | null, rpcName: string) {
  if (!error || !["42883", "PGRST202"].includes(error.code ?? "")) return false;
  const text = errorText(error);
  return text.includes(rpcName)
    && /(?:not found|does not exist|schema cache|could not find)/i.test(text);
}

export function isMissingPushTransportColumn(error: PostgrestErrorLike | null) {
  if (!error || !["42703", "PGRST204"].includes(error.code ?? "")) return false;
  const text = errorText(error);
  return /\btransport\b/i.test(text)
    && /(?:column|field|not found|does not exist|schema cache|could not find)/i.test(text);
}
