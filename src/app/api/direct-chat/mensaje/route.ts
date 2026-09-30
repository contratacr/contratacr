import { NextResponse } from "next/server";
import { idiomaDeLaPeticion, mensajeDeError } from "@/lib/api-errors";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDirectMessage } from "@/lib/moderation/messages";
import { dentroDeLaVentanaDeEdicion } from "@/lib/direct-chat/edicion-de-mensajes";

// Editar y anular UN mensaje, como WhatsApp (migración 224).
//
// · Editar y eliminar PARA TODOS: solo el autor y solo en los primeros 15
//   minutos. La regla vive aquí, no en la pantalla: la pantalla solo esconde el
//   botón, quien decide es el servidor.
// · Eliminar PARA MÍ: cualquiera de las dos partes, sin límite de tiempo. Solo
//   lo esconde de su lado; la otra persona lo sigue viendo.
//
// Lo que ya salió no se recoge: si el push o el correo ya se enviaron, la otra
// persona pudo leer el texto original. Lo que sí se corrige es lo que vive en
// la app: la vista previa de la bandeja y el aviso de la campana sin leer.

const TEXTO_ELIMINADO = "Se eliminó este mensaje";
const ATTACHMENT_BUCKET = "direct-message-attachments";

type Conversacion = {
  id: string;
  client_id: string;
  professional_profile_id: string;
  status?: string | null;
  last_message_at?: string | null;
};
type Mensaje = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_urls: unknown;
  read_at: string | null;
  created_at: string;
  deleted_at: string | null;
  hidden_for: string[] | null;
};

async function cargar(req: Request, messageId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { respuesta: NextResponse.json({ error: mensajeDeError(req, { es: "No autorizado", en: "Unauthorized" }) }, { status: 401 }) };
  const noEncontrado = NextResponse.json({ error: mensajeDeError(req, { es: "Mensaje no encontrado", en: "Message not found" }) }, { status: 404 });
  if (!messageId) return { respuesta: noEncontrado };
  const db = createAdminClient();
  const { data: mensaje } = await db.from("direct_messages")
    .select("id, conversation_id, sender_id, body, attachment_urls, read_at, created_at, deleted_at, hidden_for")
    .eq("id", messageId).maybeSingle();
  if (!mensaje) return { respuesta: noEncontrado };
  const { data: conversacion } = await db.from("direct_conversations")
    .select("id, client_id, professional_profile_id, status, last_message_at")
    .eq("id", (mensaje as Mensaje).conversation_id).maybeSingle();
  const c = conversacion as Conversacion | null;
  if (!c || (c.client_id !== user.id && c.professional_profile_id !== user.id)) return { respuesta: noEncontrado };
  return { db, userId: user.id, mensaje: mensaje as Mensaje, conversacion: c };
}

function dentroDeLaVentana(mensaje: Mensaje) {
  return dentroDeLaVentanaDeEdicion(mensaje.created_at);
}

// ¿Es el último mensaje del hilo? Entonces la vista previa de la bandeja y el
// aviso sin leer de la otra persona muestran su texto y hay que corregirlos.
async function corregirVistaPrevia(
  db: ReturnType<typeof createAdminClient>,
  conversacion: Conversacion,
  mensaje: Mensaje,
  texto: string,
) {
  const { data: ultimo } = await db.from("direct_messages")
    .select("id").eq("conversation_id", conversacion.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if ((ultimo as { id: string } | null)?.id !== mensaje.id) return;
  const resumen = texto.length > 96 ? `${texto.slice(0, 96)}...` : texto;
  const receptor = mensaje.sender_id === conversacion.client_id ? conversacion.professional_profile_id : conversacion.client_id;
  await Promise.all([
    db.from("direct_conversations").update({ last_message: texto }).eq("id", conversacion.id),
    db.from("notifications").update({ message: resumen })
      .eq("user_id", receptor).eq("type", "direct_message").eq("read", false)
      .eq("data->>conversation_id", conversacion.id),
  ]);
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cargado = await cargar(req, String(body.messageId ?? ""));
  if ("respuesta" in cargado) return cargado.respuesta;
  const { db, userId, mensaje, conversacion } = cargado;
  const idioma = idiomaDeLaPeticion(req);

  if (mensaje.sender_id !== userId || mensaje.deleted_at) {
    return NextResponse.json({ error: mensajeDeError(req, { es: "Solo puedes editar tus propios mensajes.", en: "You can only edit your own messages." }) }, { status: 403 });
  }
  if (conversacion.status === "blocked") {
    return NextResponse.json({ error: mensajeDeError(req, { es: "Esta conversación está bloqueada.", en: "This conversation is blocked." }) }, { status: 403 });
  }
  if (!dentroDeLaVentana(mensaje)) {
    return NextResponse.json({ error: mensajeDeError(req, { es: "Solo se puede editar durante los primeros 15 minutos.", en: "Messages can only be edited within 15 minutes." }) }, { status: 403 });
  }
  const moderacion = validateDirectMessage(body.body, idioma);
  if (!moderacion.ok) return NextResponse.json({ error: moderacion.error }, { status: 400 });
  const tieneAdjuntos = Array.isArray(mensaje.attachment_urls) && mensaje.attachment_urls.length > 0;
  if (!moderacion.message && !tieneAdjuntos) {
    return NextResponse.json({ error: mensajeDeError(req, { es: "El mensaje no puede quedar vacío.", en: "The message cannot be empty." }) }, { status: 400 });
  }
  if (moderacion.message === mensaje.body.trim()) return NextResponse.json({ ok: true, unchanged: true });

  const editadoEn = new Date().toISOString();
  const { error } = await db.from("direct_messages")
    .update({ body: moderacion.message, edited_at: editadoEn })
    .eq("id", mensaje.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await corregirVistaPrevia(db, conversacion, mensaje, moderacion.message || "Archivo adjunto");
  return NextResponse.json({ ok: true, body: moderacion.message, edited_at: editadoEn });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cargado = await cargar(req, String(body.messageId ?? ""));
  if ("respuesta" in cargado) return cargado.respuesta;
  const { db, userId, mensaje, conversacion } = cargado;

  if (body.scope === "me") {
    const ocultos = new Set(mensaje.hidden_for ?? []);
    ocultos.add(userId);
    const { error } = await db.from("direct_messages").update({ hidden_for: [...ocultos] }).eq("id", mensaje.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, scope: "me" });
  }

  if (body.scope !== "everyone") {
    return NextResponse.json({ error: mensajeDeError(req, { es: "Acción inválida.", en: "Invalid action." }) }, { status: 400 });
  }
  if (mensaje.sender_id !== userId) {
    return NextResponse.json({ error: mensajeDeError(req, { es: "Solo puedes eliminar para todos tus propios mensajes.", en: "You can only delete your own messages for everyone." }) }, { status: 403 });
  }
  if (mensaje.deleted_at) return NextResponse.json({ ok: true, scope: "everyone" });
  if (!dentroDeLaVentana(mensaje)) {
    return NextResponse.json({ error: mensajeDeError(req, { es: "Solo se puede eliminar para todos durante los primeros 15 minutos.", en: "Messages can only be deleted for everyone within 15 minutes." }) }, { status: 403 });
  }

  // Los adjuntos se borran de verdad: «eliminar para todos» que deje el archivo
  // accesible no sería eliminar.
  const rutas = Array.isArray(mensaje.attachment_urls)
    ? mensaje.attachment_urls.flatMap((item) => (item && typeof item === "object" && typeof (item as { path?: unknown }).path === "string" ? [(item as { path: string }).path] : []))
    : [];
  if (rutas.length) await db.storage.from(ATTACHMENT_BUCKET).remove(rutas);

  const { error } = await db.from("direct_messages")
    .update({ body: "", attachment_urls: [], deleted_at: new Date().toISOString() })
    .eq("id", mensaje.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Si la otra persona todavía no lo leía, deja de contar como pendiente.
  if (!mensaje.read_at) {
    const campo = mensaje.sender_id === conversacion.client_id ? "professional_unread_count" : "client_unread_count";
    const { data: actual } = await db.from("direct_conversations").select(campo).eq("id", conversacion.id).maybeSingle();
    const pendientes = Number((actual as Record<string, unknown> | null)?.[campo] ?? 0);
    if (pendientes > 0) await db.from("direct_conversations").update({ [campo]: pendientes - 1 }).eq("id", conversacion.id);
  }
  await corregirVistaPrevia(db, conversacion, mensaje, TEXTO_ELIMINADO);
  return NextResponse.json({ ok: true, scope: "everyone" });
}
