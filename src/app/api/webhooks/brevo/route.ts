import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COLUMNA_POR_EVENTO } from "@/lib/email/campana";

/**
 * LO QUE BREVO CUENTA DE VUELTA SOBRE UN CORREO DE CAMPAÑA.
 *
 * El panel sabía cuántos correos SALIERON y nada más. «Se enviaron 200» es
 * trabajo hecho, no resultado: no dice si alguien abrió ni si alguien tocó el
 * botón, que es lo único que decide si la próxima campaña vale la pena.
 *
 * Brevo ya lo registra y lo avisa por aquí. Cada aviso trae el correo de la
 * persona y la etiqueta de campaña que `sendBrevoEmail` mandó en `tags`, y con
 * esas dos cosas se encuentra la fila de `admin_campaign_sends`.
 *
 * Solo se anota la PRIMERA vez de cada cosa (`is null` en el `update`): la
 * segunda apertura no cambia ninguna decisión, y así un correo reenviado en
 * cadena no corre la hora de lectura.
 *
 * Esta ruta la llama Brevo, no el app: no hay sesión que revisar. La defensa es
 * un secreto compartido en la dirección (`?clave=`), que es lo que Brevo
 * permite configurar. Sin `BREVO_WEBHOOK_SECRET` la ruta queda apagada, para
 * que no exista una puerta abierta en un entorno donde nadie la configuró.
 */

export async function POST(request: Request) {
  const secreto = process.env.BREVO_WEBHOOK_SECRET;
  if (!secreto) return NextResponse.json({ ok: true, ignorado: "sin secreto configurado" });
  if (new URL(request.url).searchParams.get("clave") !== secreto) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const aviso = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!aviso) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });

  const columna = COLUMNA_POR_EVENTO[String(aviso.event ?? "")];
  const email = String(aviso.email ?? "").toLowerCase().trim();
  // La etiqueta puede llegar como lista (`tags`) o suelta (`tag`), según el
  // tipo de aviso; Brevo no es consistente entre unos y otros.
  const etiquetas = Array.isArray(aviso.tags) ? aviso.tags.map(String) : aviso.tag ? [String(aviso.tag)] : [];
  const campana = etiquetas[0];
  if (!columna || !email || !campana) return NextResponse.json({ ok: true, ignorado: true });

  // La hora la manda Brevo; si no viene, vale la de ahora. Nunca se inventa una
  // hora anterior: eso desordenaría la lectura de «a qué hora abre la gente».
  const cuando = typeof aviso.date === "string" ? new Date(aviso.date) : new Date();
  const momento = Number.isNaN(cuando.getTime()) ? new Date().toISOString() : cuando.toISOString();

  const db = createAdminClient();
  const { error } = await db
    .from("admin_campaign_sends")
    .update({ [columna]: momento })
    .eq("campana", campana)
    .eq("email", email)
    .is(columna, null);

  // Un fallo aquí no se le devuelve a Brevo como error: reintentaría el mismo
  // aviso en bucle. Queda en el registro y el correo simplemente no se cuenta.
  if (error) console.error("[brevo-webhook] no se pudo anotar:", error.message);
  return NextResponse.json({ ok: true });
}
