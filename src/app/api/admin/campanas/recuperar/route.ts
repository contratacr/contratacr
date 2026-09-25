import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { campanaDesdeAsunto, COLUMNA_POR_EVENTO } from "@/lib/email/campana";

/**
 * RESCATE DE LAS CAMPAÑAS QUE YA SALIERON SIN MEDIR.
 *
 * El webhook (`/api/webhooks/brevo`) solo escucha de aquí en adelante, y para
 * cuando quedó listo ya habían salido las dos tandas: 200 el primer día y 204
 * el segundo. Sin esto, esas 404 personas se quedaban como «enviado» y nunca
 * se iba a saber si alguien abrió el correo.
 *
 * No hace falta que hubieran llevado etiqueta. Brevo guarda un registro de
 * eventos de los últimos 30 días y cada evento trae el ASUNTO, que es
 * exactamente de donde sale el nombre de la campaña (`campanaDesdeAsunto`).
 * Con el asunto y el correo se encuentra la fila; la etiqueta que se agregó al
 * envío es para que esto no vuelva a hacer falta, no para esto.
 *
 * Se puede correr más de una vez sin daño: cada anotación solo entra si la
 * columna estaba vacía, así que repetirlo no mueve ninguna hora ya guardada.
 *
 * Los 30 días de Brevo son el límite duro: lo que salió antes ya no se puede
 * recuperar por ningún lado.
 */

const BREVO_EVENTOS = "https://api.brevo.com/v3/smtp/statistics/events";
const POR_PAGINA = 1000;
const MAX_PAGINAS = 30; // 30 000 eventos: de sobra para cualquier campaña de este tamaño.

type EventoBrevo = { email?: string; subject?: string; event?: string; date?: string };

export async function POST(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const key = process.env.BREVO_API_KEY;
  if (!key) return NextResponse.json({ error: "Brevo no está configurado" }, { status: 400 });

  // Por defecto los últimos 30 días, que es todo lo que Brevo guarda.
  const dias = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("dias") ?? 30)));

  const db = createAdminClient();
  // Solo se rescata lo que está en el registro de envíos: si un correo no
  // salió de una campaña nuestra, no hay fila que anotar y no nos interesa.
  const { data: filas, error: errorFilas } = await db
    .from("admin_campaign_sends")
    .select("campana, email")
    .limit(20000);
  if (errorFilas) return NextResponse.json({ error: errorFilas.message }, { status: 500 });
  const conocidas = new Set((filas ?? []).map((f) => `${f.campana}|${String(f.email).toLowerCase()}`));
  if (conocidas.size === 0) return NextResponse.json({ revisados: 0, anotados: 0, detalle: {} });

  let revisados = 0;
  const anotar = new Map<string, { campana: string; email: string; columna: string; momento: string }>();

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const url = `${BREVO_EVENTOS}?limit=${POR_PAGINA}&offset=${pagina * POR_PAGINA}&days=${dias}`;
    const res = await fetch(url, { headers: { "api-key": key, accept: "application/json" } });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ error: `Brevo respondió ${res.status}: ${txt.slice(0, 200)}` }, { status: 502 });
    }
    const eventos = ((await res.json()) as { events?: EventoBrevo[] }).events ?? [];
    if (eventos.length === 0) break;

    for (const ev of eventos) {
      revisados += 1;
      const columna = COLUMNA_POR_EVENTO[String(ev.event ?? "")];
      const email = String(ev.email ?? "").toLowerCase().trim();
      if (!columna || !email || !ev.subject) continue;
      const campana = campanaDesdeAsunto(ev.subject);
      if (!conocidas.has(`${campana}|${email}`)) continue;

      const fecha = new Date(String(ev.date));
      const momento = (Number.isNaN(fecha.getTime()) ? new Date() : fecha).toISOString();
      // Brevo devuelve lo más reciente primero. Si la misma persona abrió tres
      // veces, la que vale es la PRIMERA, así que la más vieja pisa a la otra.
      const llave = `${campana}|${email}|${columna}`;
      const previo = anotar.get(llave);
      if (!previo || momento < previo.momento) anotar.set(llave, { campana, email, columna, momento });
    }
    if (eventos.length < POR_PAGINA) break;
  }

  const detalle: Record<string, number> = {};
  let anotados = 0;
  for (const { campana, email, columna, momento } of anotar.values()) {
    const { error, count } = await db
      .from("admin_campaign_sends")
      .update({ [columna]: momento }, { count: "exact" })
      .eq("campana", campana)
      .eq("email", email)
      .is(columna, null);
    if (error) continue;
    if (count) {
      anotados += count;
      detalle[columna] = (detalle[columna] ?? 0) + count;
    }
  }

  console.info(`[campanas] rescate: ${revisados} eventos revisados, ${anotados} anotados`, detalle);
  return NextResponse.json({ revisados, anotados, detalle, dias });
}
