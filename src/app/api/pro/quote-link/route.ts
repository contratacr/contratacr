import { z } from "zod";
import { proApiAccess, proDbFailure } from "@/lib/pro/api-access";
import { businessSchema, emptyBusiness } from "@/lib/pro/business";
import { validateQuoteLinks } from "@/lib/pro/quote-links-server";
export async function POST(req: Request) {
  const access = await proApiAccess(req);
  if (access.error) return access.error;
  try {
    const { quoteId, clientId } = z
      .object({ quoteId: z.string().uuid(), clientId: z.string().min(1) })
      .parse(await req.json());
    const { data: stored, error } = await access.db
      .from("pro_workspaces")
      .select("document,revision")
      .eq("user_id", access.user.id)
      .maybeSingle();
    if (error) return proDbFailure(error);
    const document = stored
      ? businessSchema.parse(stored.document)
      : emptyBusiness();
    if (!document.clients.some((c) => c.id === clientId && !c.archived))
      return Response.json(
        { error: "Seleccione un cliente activo." },
        { status: 400 },
      );
    const previous = document.quoteLinks.find((l) => l.quoteId === quoteId);
    if (previous && previous.clientId !== clientId)
      return Response.json(
        { error: "La cotización ya tiene un cliente vinculado." },
        { status: 409 },
      );
    if (!previous) document.quoteLinks.push({ quoteId, clientId });
    await validateQuoteLinks(access.db, access.user.id, document);
    if (previous) return Response.json({ ok: true });
    const { error: saveError } = await access.db.rpc("pro_save_workspace", {
      p_user: access.user.id,
      p_document: document,
      p_revision: stored?.revision ?? 0,
    });
    if (saveError) return proDbFailure(saveError);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      {
        error:
          "No se pudo vincular la cotización. Revise el cliente y reintente.",
      },
      { status: 400 },
    );
  }
}
