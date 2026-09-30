import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApiAdmin } from "@/lib/auth/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { DOC_KINDS, IMAGE_KINDS, MIME_FOR, validateUpload } from "@/lib/upload-validation";
import { BUCKET_SOPORTE } from "@/lib/support/adjuntos";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;

function nombreSeguro(name: string) {
  const limpio = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return limpio || "archivo";
}

// POST /api/support/adjuntos — sube una foto o PDF a un ticket. Puede hacerlo
// quien abrió el ticket o el equipo (admin). El archivo queda privado; el
// mensaje lo referencia por su ruta al enviarse.
export async function POST(req: Request) {
  const rl = enforceRateLimit(req, "support-attachment", 18, 60_000);
  if (rl) return rl;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para adjuntar archivos." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  const ticketId = String(formData?.get("ticketId") ?? "");
  if (!ticketId) return NextResponse.json({ error: "Ticket requerido." }, { status: 400 });
  if (!file) return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo debe pesar 4 MB o menos." }, { status: 400 });

  const db = createAdminClient();
  const { data: ticket } = await db.from("support_tickets").select("id, user_id").eq("id", ticketId).maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado." }, { status: 404 });
  if (ticket.user_id !== user.id && !(await getApiAdmin())) {
    return NextResponse.json({ error: "Ticket no encontrado." }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const check = validateUpload(buffer, {
    allow: [...IMAGE_KINDS, ...DOC_KINDS],
    maxBytes: MAX_BYTES,
    allowLabel: "JPG, PNG, WEBP, AVIF, HEIC/HEIF, GIF o PDF",
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const mime = MIME_FOR[check.kind];

  const name = nombreSeguro(file.name);
  const path = `${ticketId}/${user.id}/${Date.now()}-${crypto.randomUUID()}-${name}`;
  const { error } = await db.storage.from(BUCKET_SOPORTE).upload(path, buffer, { contentType: mime, upsert: false });
  if (error) {
    // El detalle técnico (p. ej. «Bucket not found» si falta la migración 227)
    // va al registro; a la persona, un mensaje que entienda.
    console.error("[support/adjuntos] no se pudo subir", error.message);
    return NextResponse.json({ error: "No se pudo subir el archivo. Intenta de nuevo en un momento." }, { status: 500 });
  }

  const { data: firmado } = await db.storage.from(BUCKET_SOPORTE).createSignedUrl(path, 60 * 60);
  return NextResponse.json({ attachment: { path, name, type: mime, size: file.size, url: firmado?.signedUrl ?? null } });
}
