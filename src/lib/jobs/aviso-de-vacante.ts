import { sinOcultos } from "@/lib/queries/sin-ocultos";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";
import { hasDurablePushOutbox, sendNotificationPush } from "@/lib/push/notify";
import { after } from "next/server";
import { avisarPorCorreo } from "@/lib/notifications/aviso-por-correo";
import { rutaEmpleo } from "@/lib/marketplace-url";

/**
 * UNA VACANTE NUEVA LE LLEGA A QUIEN HACE ESE OFICIO.
 *
 * Mismo criterio que un proyecto: se avisa a los profesionales cuya categoría
 * principal o cuyas profesiones incluyen el servicio de la vacante. El servicio
 * lo ELIGE quien publica, de una lista; no se deduce del título, porque
 * «Mecánico Diésel» le caería también a los mecánicos industriales y un par de
 * avisos equivocados bastan para que la gente apague las notificaciones.
 *
 * Campana, push y correo. El correo se agregó el 7-oct-2026: casi ningún
 * profesional tiene push, y el volumen cabe en el cupo diario (ver
 * lib/notifications/aviso-por-correo.ts, donde está el plan si crece).
 *
 * Nunca se avisa al que publica, ni se avisa dos veces por el mismo empleo:
 * editar una vacante no vuelve a sonarle a nadie.
 */
/**
 * A quién le llegaría el aviso de una vacante de este servicio. Lo usan el aviso
 * y el formulario, que muestra el número antes de publicar («Se le avisará a 18
 * profesionales de Desarrollo web»): así un servicio mal elegido salta a la vista.
 */
export async function destinatariosDeVacante(
  serviceCategoryId: string,
  employerProfileId: string | null | undefined,
): Promise<string[]> {
  const db = createAdminClient();
  const { data: pros } = await sinOcultos((excluirOcultos) => {
    const q = db
      .from("professionals")
      .select("profile_id")
      .or(`category_id.eq.${serviceCategoryId},professions.cs.{${serviceCategoryId}}`)
      .eq("is_banned", false);
    return excluirOcultos ? q.eq("oculto_del_buscador", false) : q;
  });
  return [...new Set(
    (pros ?? [])
      .map((pro) => pro.profile_id)
      .filter((id): id is string => !!id && id !== employerProfileId),
  )];
}

export async function avisarVacanteAProfesionales({
  jobId,
  serviceCategoryId,
  title,
  employerProfileId,
}: {
  jobId: string;
  serviceCategoryId: string | null | undefined;
  title: string;
  employerProfileId: string | null | undefined;
}): Promise<number> {
  if (!jobId || !serviceCategoryId) return 0;
  const db = createAdminClient();

  // Editar no vuelve a avisar: si ya salió un aviso de esta vacante, se sale.
  const { data: yaAvisado } = await db
    .from("notifications")
    .select("id")
    .eq("type", "new_job")
    .contains("data", { job_id: jobId })
    .limit(1);
  if ((yaAvisado ?? []).length > 0) return 0;

  const destinatarios = await destinatariosDeVacante(serviceCategoryId, employerProfileId);
  if (destinatarios.length === 0) return 0;

  const oficio = getCategoryLabel(serviceCategoryId);
  const filas = destinatarios.map((profileId) => ({
    user_id: profileId,
    type: "new_job",
    title: "Nueva vacante",
    message: `Publicaron "${title}" en ${oficio}. Abre el empleo y escríbele por WhatsApp a quien lo publicó.`,
    data: { link: "/empleos", job_id: jobId, job_title: title, category_id: serviceCategoryId },
  }));
  await db.from("notifications").insert(filas);
  // Y por correo, cuando la respuesta ya salió (ver lib/notifications/aviso-por-correo.ts).
  after(() => avisarPorCorreo({
    destinatarios,
    asunto: `Nueva vacante de ${oficio}: ${title}`,
    titular: `Publicaron una vacante de ${oficio}: «${title}».`,
    parrafos: ["Si te interesa, ábrela y escríbele por WhatsApp a quien la publicó."],
    boton: { texto: "Ver la vacante", ruta: rutaEmpleo({ id: jobId, title }) },
    porQue: `Te llega porque ofreces ${oficio} en ContrataCR.`,
    campana: "aviso-empleo",
  }));

  // Con la migración 167 el INSERT ya quedó en el outbox durable y el push sale
  // de ahí: llamar N veces a un envío que devuelve sin hacer nada no aporta.
  if (!(await hasDurablePushOutbox())) {
    await Promise.all(filas.map((fila) => sendNotificationPush({
      userId: fila.user_id,
      title: fila.title,
      message: fila.message,
      data: fila.data,
    })));
  }
  return destinatarios.length;
}
