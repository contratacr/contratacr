import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";
import { hasDurablePushOutbox, sendNotificationPush } from "@/lib/push/notify";

/**
 * UNA VACANTE NUEVA LE LLEGA A QUIEN HACE ESE OFICIO.
 *
 * Mismo criterio que un proyecto: se avisa a los profesionales cuya categoría
 * principal o cuyas profesiones incluyen el servicio de la vacante. El servicio
 * lo ELIGE quien publica, de una lista; no se deduce del título, porque
 * «Mecánico Diésel» le caería también a los mecánicos industriales y un par de
 * avisos equivocados bastan para que la gente apague las notificaciones.
 *
 * Solo campana y push, que son gratis. El correo NO: con el plan actual son 300
 * al día compartidos con recuperar contraseña y responder soporte, y una sola
 * vacante de electricidad son 45 correos. Cuando el plan cambie, el resumen
 * diario es el camino —un correo por persona al día, no uno por publicación—.
 *
 * Nunca se avisa al que publica, ni se avisa dos veces por el mismo empleo:
 * editar una vacante no vuelve a sonarle a nadie.
 */
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

  const { data: pros } = await db
    .from("professionals")
    .select("profile_id")
    .or(`category_id.eq.${serviceCategoryId},professions.cs.{${serviceCategoryId}}`)
    .eq("is_banned", false);

  const destinatarios = [...new Set(
    (pros ?? [])
      .map((pro) => pro.profile_id)
      .filter((id): id is string => !!id && id !== employerProfileId),
  )];
  if (destinatarios.length === 0) return 0;

  const oficio = getCategoryLabel(serviceCategoryId);
  const filas = destinatarios.map((profileId) => ({
    user_id: profileId,
    type: "new_job",
    title: "Nueva vacante",
    message: `Publicaron "${title}" en ${oficio}. Abre el empleo y escríbele por WhatsApp a quien lo publicó.`,
    data: { link: "/es/empleos", job_id: jobId, job_title: title, category_id: serviceCategoryId },
  }));
  await db.from("notifications").insert(filas);

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
