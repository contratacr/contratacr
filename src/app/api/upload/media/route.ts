import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { deleteOwnedMediaAsset } from "@/lib/cloudinary-ownership";

export const runtime = "nodejs";

export async function DELETE(req: Request) {
  const rateLimited = enforceRateLimit(req, "delete-owned-media", 30, 60_000);
  if (rateLimited) return rateLimited;

  const user = await safeGetUser(await createClient());
  if (!user) return NextResponse.json({ error: "Inicia sesión para eliminar archivos." }, { status: 401 });

  try {
    const body = await req.json().catch(() => null) as { url?: unknown } | null;
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url || url.length > 2048) {
      return NextResponse.json({ error: "URL de archivo inválida." }, { status: 400 });
    }
    const result = await deleteOwnedMediaAsset(user.id, url);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[DELETE /api/upload/media]", error);
    return NextResponse.json({ error: "No se pudo eliminar el archivo." }, { status: 500 });
  }
}
