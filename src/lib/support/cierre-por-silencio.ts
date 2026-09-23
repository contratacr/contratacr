import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUserOfReply } from "@/lib/support-notify";
import { sendNotificationPush } from "@/lib/push/notify";
import { buildSupportCloseMessage } from "@/lib/support/close-reasons";

/**
 * UN CASO NO SE QUEDA ABIERTO PARA SIEMPRE ESPERANDO A QUIEN YA NO VA A
 * RESPONDER.
 *
 * Se cierra solo cuando la pelota está del lado del usuario: el último mensaje
 * del hilo es de soporte (`last_reply_role === "admin"`) y pasaron los días sin
 * que contestara. Si el último mensaje es SUYO, la pelota es nuestra y cerrarlo
 * sería echarlo: esos no se tocan nunca.
 *
 * Siete días, no tres ni catorce: con tres se cierra a quien estaba de viaje o
 * esperando una factura; con catorce la cola queda sucia dos semanas. Y cerrar
 * aquí no cuesta nada, porque responder reabre el MISMO hilo con todo su
 * historial —lo dice el propio mensaje de cierre—, así que siete es holgado.
 *
 * Lo que se publica es exactamente lo que publica el cierre a mano con el
 * motivo «Sin respuesta del usuario»: mensaje en el hilo, correo y campana. Un
 * caso que se cierra en silencio deja a la persona sin saber si la leyeron.
 */
export const DIAS_DE_SILENCIO = 7;

export type ResumenDeCierre = { revisados: number; cerrados: number; fallidos: number };

export async function cerrarCasosSinRespuesta(dias = DIAS_DE_SILENCIO): Promise<ResumenDeCierre> {
  const db = createAdminClient();
  const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("support_tickets")
    .select("id, subject, email, name, user_id, last_reply_at")
    .in("status", ["open", "in_progress"])
    .eq("last_reply_role", "admin")
    .lt("last_reply_at", corte)
    .limit(200);
  if (error) throw new Error(error.message);

  const casos = data ?? [];
  const resumen: ResumenDeCierre = { revisados: casos.length, cerrados: 0, fallidos: 0 };
  const cuerpo = buildSupportCloseMessage("no_reply");
  if (!cuerpo) throw new Error("support_close_message_missing");

  for (const caso of casos) {
    try {
      const ahora = new Date().toISOString();
      const { error: errorCierre } = await db
        .from("support_tickets")
        .update({
          status: "resolved",
          reviewed_at: ahora,
          handled_at: ahora,
          handled_by_name: "Soporte ContrataCR",
          last_reply_at: ahora,
          last_reply_role: "admin",
          user_confirmed: false,
        })
        .eq("id", caso.id)
        // Que nadie haya contestado entre la consulta y esta escritura.
        .eq("last_reply_role", "admin")
        .in("status", ["open", "in_progress"]);
      if (errorCierre) throw new Error(errorCierre.message);

      await db.from("support_ticket_messages").insert({
        ticket_id: caso.id,
        sender_role: "admin",
        sender_name: "Soporte ContrataCR",
        body: cuerpo,
      });

      let panel: "cliente" | "profesional" = "cliente";
      if (caso.user_id) {
        const { data: perfil } = await db.from("profiles").select("role").eq("id", caso.user_id).maybeSingle();
        if (perfil?.role === "professional") panel = "profesional";
      }
      if (caso.email) {
        await notifyUserOfReply({
          toEmail: caso.email, toName: caso.name, subject: caso.subject,
          body: cuerpo, hasAccount: !!caso.user_id, panel, ticketId: caso.id,
        });
      }
      if (caso.user_id) {
        const aviso = {
          user_id: caso.user_id,
          type: "support_reply",
          title: "Caso de soporte cerrado",
          message: `Soporte cerró tu caso "${caso.subject}". Puedes responder si el problema continúa.`,
          data: { link: `/es/dashboard/${panel}?tab=soporte&ticket=${caso.id}`, ticketId: caso.id, ticket_subject: caso.subject },
        };
        await db.from("notifications").insert(aviso);
        await sendNotificationPush({ userId: aviso.user_id, ...aviso });
      }
      resumen.cerrados += 1;
    } catch {
      // Un caso que falla no puede tumbar a los demás: se cuenta y se sigue.
      resumen.fallidos += 1;
    }
  }
  return resumen;
}
