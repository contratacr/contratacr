import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST /api/portfolio-like  { professionalId, caseId }
// Public "me gusta" on a caso de éxito — increments that case's `likes` in the pro's
// portfolio_items (service-role read-modify-write). Anonymous on purpose (visitors aren't
// logged in); a per-IP rate limit + the caller's own localStorage guard bound abuse, and the
// endpoint can ONLY ever +1 a single existing case (no other writes). Returns the new count.
export async function POST(req: NextRequest) {
  const rl = enforceRateLimit(req, "portfolio-like", 40, 60_000);
  if (rl) return rl;

  let body: { professionalId?: string; caseId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 }); }
  const { professionalId, caseId } = body ?? {};
  if (!professionalId || !caseId) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

  const admin = createAdminClient();
  const { data: pro } = await admin.from("professionals").select("portfolio_items").eq("id", professionalId).maybeSingle();
  if (!pro) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(pro.portfolio_items) ? pro.portfolio_items : [];
  let newLikes: number | null = null;
  const next = items.map((it) => {
    if (it && it.id === caseId && Array.isArray(it.photos)) {
      newLikes = (Number(it.likes) || 0) + 1;
      return { ...it, likes: newLikes };
    }
    return it;
  });
  if (newLikes === null) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });

  const { error } = await admin.from("professionals").update({ portfolio_items: next }).eq("id", professionalId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ likes: newLikes });
}
