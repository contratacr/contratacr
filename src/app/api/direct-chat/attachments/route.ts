import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BUCKET = "direct-message-attachments";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

type ConversationRow = {
  id: string;
  client_id: string;
  professional_profile_id: string;
  status?: string | null;
};

function participant(row: ConversationRow, userId: string) {
  return row.client_id === userId || row.professional_profile_id === userId;
}

function safeFileName(name: string) {
  const fallback = "archivo";
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return cleaned || fallback;
}

function sniffMime(buffer: Buffer) {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export async function POST(req: Request) {
  const rl = enforceRateLimit(req, "direct-chat-attachment", 18, 60_000);
  if (rl) return rl;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesion para adjuntar archivos." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  const conversationId = String(formData?.get("conversationId") ?? "");
  if (!conversationId) return NextResponse.json({ error: "Conversacion requerida." }, { status: 400 });
  if (!file) return NextResponse.json({ error: "No se recibio ningun archivo." }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: "El archivo esta vacio." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo debe pesar 5 MB o menos." }, { status: 400 });

  const db = createAdminClient();
  const { data: conversation, error: conversationError } = await db
    .from("direct_conversations")
    .select("id, client_id, professional_profile_id, status")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversationError) return NextResponse.json({ error: conversationError.message }, { status: 500 });
  if (!conversation || !participant(conversation as ConversationRow, user.id)) {
    return NextResponse.json({ error: "Conversacion no encontrada." }, { status: 404 });
  }
  if ((conversation as ConversationRow).status === "blocked") {
    return NextResponse.json({ error: "Esta conversacion esta bloqueada." }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buffer);
  if (!mime || !ALLOWED_TYPES.has(mime)) {
    return NextResponse.json({ error: "Adjunta solo imagenes JPG, PNG, WEBP o PDF." }, { status: 400 });
  }

  const name = safeFileName(file.name);
  const path = `${conversationId}/${user.id}/${Date.now()}-${crypto.randomUUID()}-${name}`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return NextResponse.json({
    attachment: {
      path,
      name,
      type: mime,
      size: file.size,
      url: signed?.signedUrl ?? null,
    },
  });
}
