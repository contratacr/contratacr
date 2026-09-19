import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationPush } from "@/lib/push/notify";
import { usersWithActivePush } from "@/lib/direct-chat/outside-app-notify";
import { brandedEmailDocument, sendBrevoEmail } from "@/lib/email/send";
import { escaparHtml } from "@/lib/email/escape";

// Recordatorios por inactividad.
//
// La app cierra cosas "de paso" (un trabajo marcado como hecho se auto-confirma
// a los 7 días si el cliente no responde), pero nada avisa ANTES de que algo se
// olvide. Los trabajos no se pierden por mala fe: se pierden porque nadie
// recuerda que están ahí. Esto revisa lo que lleva días detenido y manda un
// aviso, a quien le toca actuar.
//
// Reglas de convivencia:
//  • Un aviso por cosa y por hito (3 y 7 días). Nunca se repite: la propia
//    notificación guardada es la marca de que ya se avisó, así que correr esto
//    dos veces el mismo día no molesta a nadie.
//  • Solo se avisa a quien puede hacer algo al respecto.
//  • Nada se cancela ni se cierra: esto solo recuerda.

export const HITOS_DIAS = [3, 7] as const;

type Hito = (typeof HITOS_DIAS)[number];

export const TIPOS_RECORDATORIO = [
  "project_proposals_waiting",
  "booking_pending_reminder",
  "project_in_progress_idle",
  "project_confirmation_pending",
  "booking_past_date_idle",
  "job_applications_waiting",
  "quote_awaiting_client",
] as const;

type TipoRecordatorio = (typeof TIPOS_RECORDATORIO)[number];

export type Aviso = {
  user_id: string;
  type: TipoRecordatorio;
  title: string;
  message: string;
  data: Record<string, unknown>;
  /** Lo que este aviso vigila: sirve para no repetirlo. */
  referencia: string;
  hito: Hito;
};

/**
 * El aviso por correo para quien NO tiene la app instalada.
 *
 * Un push solo llega al teléfono que instaló la app, y la mayoría de los
 * clientes entran por la web: sin esto, el recordatorio se escribía en una
 * campana que esa persona no iba a abrir. Solo al hito de 7 días, que es cuando
 * la cosa lleva de verdad detenida, y nunca con el detalle del trabajo: el
 * correo dice qué hay que hacer y el enlace lleva al app.
 */
async function avisarPorCorreo(destino: string, aviso: { title: string; message: string; data: Record<string, unknown> }) {
  const origen = (process.env.NEXT_PUBLIC_APP_URL || "https://www.contratacr.com").replace(/\/$/, "");
  const enlace = typeof aviso.data.link === "string" ? `${origen}${aviso.data.link}` : origen;
  const html = brandedEmailDocument({
    title: aviso.title,
    origin: origen,
    bodyHtml: `
      <h1 style="font-size:19px;font-weight:bold;margin:14px 0 10px 0;color:#162543;">${escaparHtml(aviso.title)}</h1>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 18px;">${escaparHtml(aviso.message)}</p>
      <p style="margin:0 0 6px;"><a href="${escaparHtml(enlace)}" style="display:inline-block;background:#009FD9;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:999px;">Ver en ContrataCR</a></p>
    `,
  });
  await sendBrevoEmail({ to: destino, subject: aviso.title, html });
}

export type ResumenRecordatorios = {
  propuestasSinResponder: number;
  postulacionesSinRevisar: number;
  cotizacionesSinRespuesta: number;
  solicitudesSinResponder: number;
  proyectosDetenidos: number;
  confirmacionesPendientes: number;
  citasSinCerrar: number;
  enviados: number;
  /** De los enviados, cuántos además salieron por correo. */
  porCorreo: number;
  repetidos: number;
  /** Avisos que la base rechazó. Cualquier número distinto de 0 es un problema. */
  fallidos: number;
  /** En ensayo no se guarda nada: `enviados` es lo que se habría enviado. */
  ensayo?: boolean;
};

export type OpcionesRecordatorios = {
  /** Cuenta y describe lo que saldría, sin escribir ni notificar a nadie. */
  ensayo?: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

function haceDias(dias: number) {
  return new Date(Date.now() - dias * DIA_MS);
}

/** El hito que corresponde a algo detenido desde `desde`: 7 manda sobre 3. */
function hitoDe(desde: string | null | undefined): Hito | null {
  if (!desde) return null;
  const marca = new Date(desde).getTime();
  if (!Number.isFinite(marca)) return null;
  const dias = (Date.now() - marca) / DIA_MS;
  if (dias >= 7) return 7;
  if (dias >= 3) return 3;
  return null;
}

/** El id de perfil de cada profesional: las notificaciones van al perfil. */
async function perfilesDeProfesionales(
  admin: ReturnType<typeof createAdminClient>,
  ids: Array<string | null | undefined>,
) {
  const unicos = [...new Set(ids.filter(Boolean))] as string[];
  const mapa = new Map<string, string>();
  if (unicos.length === 0) return mapa;
  const { data } = await admin.from("professionals").select("id, profile_id").in("id", unicos);
  for (const pro of (data ?? []) as Array<{ id: string; profile_id: string | null }>) {
    if (pro.profile_id) mapa.set(pro.id, pro.profile_id);
  }
  return mapa;
}

/** Lo que está detenido ahora mismo, con el aviso que le corresponde a cada
 *  cosa. Lo usan el envío de recordatorios y la pantalla de admin: así las dos
 *  miran exactamente lo mismo y no hay dos definiciones de «pendiente». */
export async function recolectarPendientes(): Promise<{ avisos: Aviso[]; resumen: ResumenRecordatorios }> {
  const admin = createAdminClient();
  const resumen: ResumenRecordatorios = {
    propuestasSinResponder: 0,
    postulacionesSinRevisar: 0,
    cotizacionesSinRespuesta: 0,
    solicitudesSinResponder: 0,
    proyectosDetenidos: 0,
    confirmacionesPendientes: 0,
    citasSinCerrar: 0,
    enviados: 0,
    porCorreo: 0,
    repetidos: 0,
    fallidos: 0,
  };
  const avisos: Aviso[] = [];
  const corteISO = haceDias(HITOS_DIAS[0]).toISOString();
  // scheduled_date es `date`, no timestamp: hay que compararlo como fecha.
  const corteFecha = corteISO.slice(0, 10);

  // ── 1. Propuestas que el cliente no ha respondido ────────────────────────
  // Le toca al CLIENTE: tiene profesionales esperando una decisión.
  const { data: propuestas } = await admin
    .from("proposals")
    .select("id, created_at, project_id, projects:project_id(title, status, client_id)")
    .eq("status", "pending")
    .lt("created_at", corteISO);

  type FilaPropuesta = {
    created_at: string;
    project_id: string;
    projects: { title?: string; status?: string; client_id?: string } | Array<{ title?: string; status?: string; client_id?: string }> | null;
  };
  const porProyecto = new Map<string, { titulo: string; clientId: string; desde: string; cuantas: number }>();
  for (const fila of (propuestas ?? []) as FilaPropuesta[]) {
    const proyecto = Array.isArray(fila.projects) ? fila.projects[0] : fila.projects;
    if (!proyecto?.client_id || proyecto.status !== "open") continue;
    const previo = porProyecto.get(fila.project_id);
    porProyecto.set(fila.project_id, {
      titulo: proyecto.title ?? "tu proyecto",
      clientId: proyecto.client_id,
      // La más antigua manda: es la que lleva más tiempo esperando.
      desde: previo && previo.desde < fila.created_at ? previo.desde : fila.created_at,
      cuantas: (previo?.cuantas ?? 0) + 1,
    });
  }
  for (const [projectId, info] of porProyecto) {
    const hito = hitoDe(info.desde);
    if (!hito) continue;
    resumen.propuestasSinResponder += 1;
    avisos.push({
      user_id: info.clientId,
      type: "project_proposals_waiting",
      title: info.cuantas === 1 ? "Tienes una respuesta sin contestar" : `Tienes ${info.cuantas} respuestas sin contestar`,
      message: `Nadie ha respondido en "${info.titulo}" desde hace ${hito} días. Revisa las respuestas y elige a quien te sirva.`,
      data: {
        link: "/es/dashboard/cliente?tab=projects",
        project_id: projectId,
        project_title: info.titulo,
        hito,
        pendientes: info.cuantas,
      },
      referencia: projectId,
      hito,
    });
  }

  // ── 2. Solicitudes que el profesional no ha respondido ───────────────────
  // Le toca al PROFESIONAL: alguien pidió un servicio y sigue esperando.
  const { data: solicitudesNuevas } = await admin
    .from("bookings")
    .select("id, service_description, created_at, professional_id")
    .eq("status", "pending")
    .lt("created_at", corteISO);

  const perfilNuevas = await perfilesDeProfesionales(admin, (solicitudesNuevas ?? []).map((s) => s.professional_id));
  for (const solicitud of (solicitudesNuevas ?? []) as Array<{ id: string; service_description?: string; created_at?: string; professional_id: string }>) {
    const hito = hitoDe(solicitud.created_at);
    const perfil = perfilNuevas.get(solicitud.professional_id);
    if (!hito || !perfil) continue;
    resumen.solicitudesSinResponder += 1;
    const que = (solicitud.service_description ?? "").trim() || "una cita";
    avisos.push({
      user_id: perfil,
      type: "booking_pending_reminder",
      title: "Tienes una cita pendiente",
      message: `"${que}" lleva ${hito} días esperando. Escríbele al cliente para coordinar o cancélala con un motivo para que sepa a qué atenerse.`,
      data: { link: "/es/dashboard/profesional?tab=bookings", booking_id: solicitud.id, hito },
      referencia: solicitud.id,
      hito,
    });
  }

  // ── 3. Proyectos aceptados que nadie avanza ──────────────────────────────
  // Le toca al PROFESIONAL: aceptó el trabajo y solo él puede marcarlo hecho.
  const { data: proyectos } = await admin
    .from("projects")
    .select("id, title, updated_at, created_at, accepted_professional_id")
    .eq("status", "in_progress")
    .not("accepted_professional_id", "is", null)
    .lt("updated_at", corteISO);

  const perfilProyectos = await perfilesDeProfesionales(admin, (proyectos ?? []).map((p) => p.accepted_professional_id));
  for (const proyecto of (proyectos ?? []) as Array<{ id: string; title?: string; updated_at?: string; created_at?: string; accepted_professional_id: string }>) {
    const hito = hitoDe(proyecto.updated_at ?? proyecto.created_at);
    const perfil = perfilProyectos.get(proyecto.accepted_professional_id);
    if (!hito || !perfil) continue;
    resumen.proyectosDetenidos += 1;
    const titulo = proyecto.title ?? "un proyecto";
    avisos.push({
      user_id: perfil,
      type: "project_in_progress_idle",
      title: "¿Ya terminaste este trabajo?",
      message: `"${titulo}" lleva ${hito} días sin movimiento. Escríbele al cliente para coordinar o retira tu respuesta si no vas a poder.`,
      data: { link: "/es/dashboard/profesional?tab=proposals", project_id: proyecto.id, project_title: titulo, hito },
      referencia: proyecto.id,
      hito,
    });
  }

  // ── 4. Trabajos marcados como hechos que el cliente no confirma ──────────
  // Le toca al CLIENTE. El sistema auto-confirma a los 7 días, pero solo
  // cuando alguien entra al panel: el aviso llega igual aunque nadie entre.
  const { data: porConfirmar } = await admin
    .from("projects")
    .select("id, title, work_done_at, updated_at, client_id")
    .eq("status", "awaiting_confirmation")
    .lt("work_done_at", corteISO);

  for (const proyecto of (porConfirmar ?? []) as Array<{ id: string; title?: string; work_done_at?: string; updated_at?: string; client_id?: string }>) {
    const hito = hitoDe(proyecto.work_done_at ?? proyecto.updated_at);
    if (!hito || !proyecto.client_id) continue;
    resumen.confirmacionesPendientes += 1;
    const titulo = proyecto.title ?? "tu proyecto";
    avisos.push({
      user_id: proyecto.client_id,
      type: "project_confirmation_pending",
      title: "Confirma si el trabajo quedó listo",
      message: `El profesional marcó "${titulo}" como terminado hace ${hito} días. Confirmalo para cerrar el proyecto y dejar tu reseña.`,
      data: { link: "/es/dashboard/cliente?tab=projects", project_id: proyecto.id, project_title: titulo, hito },
      referencia: proyecto.id,
      hito,
    });
  }

  // ── 5. Citas confirmadas cuya fecha ya pasó ──────────────────────────────
  // Le toca al PROFESIONAL: la cita fue y nadie dijo si se hizo.
  const { data: citas } = await admin
    .from("bookings")
    .select("id, service_description, scheduled_date, professional_id")
    .eq("status", "confirmed")
    .not("scheduled_date", "is", null)
    .lt("scheduled_date", corteFecha);

  const perfilCitas = await perfilesDeProfesionales(admin, (citas ?? []).map((s) => s.professional_id));
  for (const cita of (citas ?? []) as Array<{ id: string; service_description?: string; scheduled_date?: string; professional_id: string }>) {
    const hito = hitoDe(cita.scheduled_date);
    const perfil = perfilCitas.get(cita.professional_id);
    if (!hito || !perfil) continue;
    resumen.citasSinCerrar += 1;
    const que = (cita.service_description ?? "").trim() || "una cita";
    avisos.push({
      user_id: perfil,
      type: "booking_past_date_idle",
      title: "¿Se realizó esta cita?",
      message: `La fecha de "${que}" pasó hace ${hito} días. Si se realizó no tienes que hacer nada: se cierra sola. Si no, cancélala con un motivo.`,
      data: { link: "/es/dashboard/profesional?tab=bookings", booking_id: cita.id, hito },
      referencia: cita.id,
      hito,
    });
  }

  // ── 6. Postulaciones que el empleador no ha revisado ─────────────────────
  // Le toca a QUIEN PUBLICÓ EL EMPLEO: hay gente esperando respuesta y el aviso
  // de cada postulación ya se perdió entre lo demás.
  const { data: postulaciones } = await admin
    .from("job_applications")
    .select("id, created_at, job_id, status, job_posts:job_id(title, status, employer_id)")
    .in("status", ["pending", "new", "submitted"])
    .lt("created_at", corteISO);

  type FilaPostulacion = {
    created_at: string;
    job_id: string;
    job_posts: { title?: string; status?: string; employer_id?: string } | Array<{ title?: string; status?: string; employer_id?: string }> | null;
  };
  const porEmpleo = new Map<string, { titulo: string; employerId: string; desde: string; cuantas: number }>();
  for (const fila of (postulaciones ?? []) as FilaPostulacion[]) {
    const empleo = Array.isArray(fila.job_posts) ? fila.job_posts[0] : fila.job_posts;
    if (!empleo?.employer_id || empleo.status !== "published") continue;
    const previo = porEmpleo.get(fila.job_id);
    porEmpleo.set(fila.job_id, {
      titulo: empleo.title ?? "tu empleo",
      employerId: empleo.employer_id,
      desde: previo && previo.desde < fila.created_at ? previo.desde : fila.created_at,
      cuantas: (previo?.cuantas ?? 0) + 1,
    });
  }
  const perfilEmpleos = await perfilesDeProfesionales(admin, [...porEmpleo.values()].map((e) => e.employerId));
  for (const [jobId, empleo] of porEmpleo) {
    const hito = hitoDe(empleo.desde);
    const perfil = perfilEmpleos.get(empleo.employerId);
    if (!hito || !perfil) continue;
    resumen.postulacionesSinRevisar += 1;
    avisos.push({
      user_id: perfil,
      type: "job_applications_waiting",
      title: empleo.cuantas === 1 ? "Tienes una postulación sin revisar" : `Tienes ${empleo.cuantas} postulaciones sin revisar`,
      message: `"${empleo.titulo}" recibió ${empleo.cuantas === 1 ? "una postulación" : `${empleo.cuantas} postulaciones`} hace ${hito} días y nadie las ha abierto.`,
      data: { link: "/es/dashboard/profesional?tab=jobs", job_id: jobId, job_title: empleo.titulo, cuantas: empleo.cuantas, hito },
      referencia: jobId,
      hito,
    });
  }

  // ── 7. Cotizaciones enviadas sin respuesta del cliente ───────────────────
  // Le toca al CLIENTE: alguien le puso precio a su trabajo y quedó esperando.
  const { data: cotizaciones } = await admin
    .from("quotes")
    .select("id, created_at, client_id, title, total")
    .eq("status", "sent")
    .lt("created_at", corteISO);

  for (const cotizacion of (cotizaciones ?? []) as Array<{ id: string; created_at: string; client_id: string; title?: string }>) {
    const hito = hitoDe(cotizacion.created_at);
    if (!hito || !cotizacion.client_id) continue;
    resumen.cotizacionesSinRespuesta += 1;
    const que = (cotizacion.title ?? "").trim() || "un trabajo";
    avisos.push({
      user_id: cotizacion.client_id,
      type: "quote_awaiting_client",
      title: "Tienes una cotización sin responder",
      message: `Recibiste una cotización por "${que}" hace ${hito} días. Aceptala o rechazala para que el profesional sepa a qué atenerse.`,
      data: { link: "/es/dashboard/profesional?tab=quotes&mode=use", quote_id: cotizacion.id, hito },
      referencia: cotizacion.id,
      hito,
    });
  }

  return { avisos, resumen };
}

export async function enviarRecordatoriosDeInactividad(
  { ensayo = false }: OpcionesRecordatorios = {},
): Promise<ResumenRecordatorios> {
  const admin = createAdminClient();
  const { avisos, resumen } = await recolectarPendientes();
  if (ensayo) resumen.ensayo = true;

  if (avisos.length === 0) return resumen;

  // ── Enviar, sin repetir ──────────────────────────────────────────────────
  // Una sola consulta trae lo ya avisado; la marca es (persona, tipo, cosa,
  // hito). El hito entra en la marca a propósito: el aviso de los 7 días debe
  // poder salir aunque el de los 3 ya haya salido.
  const { data: previas } = await admin
    .from("notifications")
    .select("user_id, type, data")
    .in("user_id", [...new Set(avisos.map((a) => a.user_id))])
    .in("type", [...TIPOS_RECORDATORIO])
    .gte("created_at", haceDias(120).toISOString());

  // Quién tiene la app y a qué dirección escribirle: una consulta para todos,
  // no una por aviso.
  const destinatarios = [...new Set(avisos.map((a) => a.user_id))];
  const conPush = ensayo ? new Set<string>() : await usersWithActivePush(admin, destinatarios);
  const correos = new Map<string, string>();
  if (!ensayo) {
    const { data: perfiles } = await admin.from("profiles").select("id, email").in("id", destinatarios);
    for (const fila of (perfiles ?? []) as Array<{ id: string; email: string | null }>) {
      if (fila.email) correos.set(fila.id, fila.email);
    }
  }

  const marca = (userId: string, type: string, referencia: string, hito: number) => `${userId}|${type}|${referencia}|${hito}`;
  const yaAvisado = new Set<string>();
  for (const fila of (previas ?? []) as Array<{ user_id: string; type: string; data: Record<string, unknown> | null }>) {
    const d = fila.data ?? {};
    const referencia = (d.project_id ?? d.booking_id ?? d.job_id ?? d.quote_id) as string | undefined;
    const hito = Number(d.hito);
    if (!referencia || !Number.isFinite(hito)) continue;
    yaAvisado.add(marca(fila.user_id, fila.type, referencia, hito));
  }

  for (const aviso of avisos) {
    const clave = marca(aviso.user_id, aviso.type, aviso.referencia, aviso.hito);
    if (yaAvisado.has(clave)) {
      resumen.repetidos += 1;
      continue;
    }
    // Se marca antes de insertar: si la misma cosa apareciera dos veces en
    // esta misma corrida, el segundo aviso no sale.
    yaAvisado.add(clave);
    if (ensayo) {
      resumen.enviados += 1;
      continue;
    }
    const { error } = await admin.from("notifications").insert({
      user_id: aviso.user_id,
      type: aviso.type,
      title: aviso.title,
      message: aviso.message,
      data: aviso.data,
    });
    if (error) {
      // Un aviso que falla no puede tumbar los demás: solo el código, nunca el
      // contenido de la notificación, entra al registro.
      console.error("[recordatorios] no se pudo guardar el aviso", { type: aviso.type, code: error.code });
      resumen.fallidos += 1;
      continue;
    }
    await sendNotificationPush({
      userId: aviso.user_id,
      title: aviso.title,
      message: aviso.message,
      data: aviso.data,
    });
    // A los 7 días, quien no tiene la app recibe además un correo: la campana
    // de una web que no se abre no avisa a nadie.
    if (aviso.hito === 7 && !conPush.has(aviso.user_id)) {
      const correo = correos.get(aviso.user_id);
      if (correo) {
        await avisarPorCorreo(correo, aviso);
        resumen.porCorreo += 1;
      }
    }
    resumen.enviados += 1;
  }

  return resumen;
}
