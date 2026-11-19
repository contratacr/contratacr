import type { SupabaseClient } from "@supabase/supabase-js";
import type { Business } from "./business";
/** Check the real owner and status; neither a submitted ID nor the UI grants access. */
export async function validateQuoteLinks(
  db: SupabaseClient,
  userId: string,
  document: Business,
) {
  const ids = [
    ...new Set([
      ...document.quoteLinks.map((l) => l.quoteId),
      ...document.work
        .filter((w) => !w.cancelled)
        .flatMap((w) => (w.externalQuoteId ? [w.externalQuoteId] : [])),
    ]),
  ];
  if (!ids.length) return;
  const { data: professional, error: ownerError } = await db
    .from("professionals")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (ownerError || !professional) throw Error("Sin perfil profesional.");
  const { data: quotes, error } = await db
    .from("quotes")
    .select("id,status,deleted_at")
    .eq("professional_id", professional.id)
    .in("id", ids);
  if (error || ids.some((id) => !quotes?.some((q) => q.id === id)))
    throw Error("Cotización no disponible.");
  for (const work of document.work) {
    if (!work.externalQuoteId || work.cancelled || work.stage === "completed")
      continue;
    const quote = quotes!.find((q) => q.id === work.externalQuoteId);
    if (quote?.status !== "accepted" || quote.deleted_at)
      throw Error("Solo puede agendar cotizaciones aceptadas.");
  }
}
