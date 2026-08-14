import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { DOC_KINDS, IMAGE_KINDS, MIME_FOR, validateUpload } from "@/lib/upload-validation";

export const runtime = "nodejs";

const BUCKET = "direct-message-attachments";
const MAX_BYTES = 4 * 1024 * 1024;

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
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo debe pesar 4 MB o menos." }, { status: 400 });

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
  const check = validateUpload(buffer, {
    allow: [...IMAGE_KINDS, ...DOC_KINDS],
    maxBytes: MAX_BYTES,
    allowLabel: "JPG, PNG, WEBP, AVIF, HEIC/HEIF, GIF o PDF",
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const mime = MIME_FOR[check.kind];

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
