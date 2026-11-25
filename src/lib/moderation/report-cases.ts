// Lógica pura (sin servidor) de la cola de reportes del panel admin.
// La agrupación ocurre solo en el cliente: no cambia ningún dato del servidor.

export type ReportPriority = "normal" | "high" | "urgent";
export type ReportStatus = "open" | "resolved";

export type AdminReport = {
  id: string;
  subject_name: string;
  subject_user_id: string | null;
  professional_id: string | null;
  professional_slug?: string | null;
  target_type: string | null;
  target_id: string | null;
  conversation_id: string | null;
  kind?: string | null;
  reason: string;
  // Solo para agrupar; nunca se muestra.
  reporter_id?: string | null;
  reporter_name: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  assigned_name: string | null;
  created_at: string;
  resolved_at?: string | null;
  decision_reason?: string | null;
  appeal_reason?: string | null;
  appealed_at?: string | null;
};

export type ReportCase = {
  /** Id del reporte más antiguo del grupo: identifica el caso en la cola. */
  id: string;
  primary: AdminReport;
  reports: AdminReport[];
  priority: ReportPriority;
  status: ReportStatus;
  assignedName: string | null;
  createdAt: string;
  latestAt: string;
};

export const RELATED_WINDOW_MS = 10 * 60 * 1000;

export const KIND_LABEL: Record<string, string> = {
  project: "Proyecto",
  job: "Empleo",
  offer: "Promoción",
  professional: "Profesional",
  review: "Reseña",
  account: "Cuenta",
};

export const PRIORITY_LABEL: Record<ReportPriority, string> = { urgent: "Urgente", high: "Alta", normal: "Normal" };
const PRIORITY_RANK: Record<ReportPriority, number> = { urgent: 3, high: 2, normal: 1 };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Profesional reportado. En reseñas y proyectos, professional_id es el
 * profesional reseñado o contactado (no la persona reportada): se ignora.
 */
export function reportedProId(r: AdminReport): string | null {
  return r.target_type === "review" || r.target_type === "project" ? null : r.professional_id;
}

function sameTarget(a: AdminReport, b: AdminReport) {
  if (a.subject_user_id || b.subject_user_id) return a.subject_user_id === b.subject_user_id;
  return !!a.target_id && a.target_type === b.target_type && a.target_id === b.target_id;
}

function related(a: AdminReport, b: AdminReport) {
  if (a.status !== b.status || !sameTarget(a, b)) return false;
  if (a.reporter_id && a.reporter_id === b.reporter_id) return true;
  return Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) <= RELATED_WINDOW_MS;
}

/** Agrupa los reportes de la página actual: mismo objetivo y (mismo reportante o ≤ 10 min). */
export function groupReports(rows: AdminReport[]): ReportCase[] {
  const groups: AdminReport[][] = [];
  for (const row of rows) {
    const group = groups.find((g) => g.some((other) => related(other, row)));
    if (group) group.push(row);
    else groups.push([row]);
  }
  return groups.map((reports) => {
    const sorted = [...reports].sort((a, b) => a.created_at.localeCompare(b.created_at));
    // Preferir como principal el reporte del contenido sobre el aviso de bloqueo de cuenta.
    const primary = sorted.find((r) => r.target_type && r.target_type !== "account") ?? sorted[0];
    const priority = sorted.reduce<ReportPriority>((top, r) => (PRIORITY_RANK[r.priority] > PRIORITY_RANK[top] ? r.priority : top), "normal");
    return {
      id: sorted[0].id,
      primary,
      reports: sorted,
      priority,
      status: primary.status,
      assignedName: sorted.find((r) => r.assigned_name)?.assigned_name ?? null,
      createdAt: sorted[0].created_at,
      latestAt: sorted[sorted.length - 1].created_at,
    };
  });
}

export function caseKindLabel(c: ReportCase) {
  return KIND_LABEL[c.primary.target_type || ""] || "Cuenta o contenido";
}

/** Misma lógica de enlace que el antiguo "Abrir contenido". */
export function contentHref(r: AdminReport): string | null {
  const base: Record<string, string> = { project: "/solicitudes/", job: "/empleos/", offer: "/promociones/", professional: "/admin/proveedores/" };
  return r.target_type && r.target_id && base[r.target_type] ? `${base[r.target_type]}${r.target_id}` : null;
}

export function adminProfileHref(c: ReportCase): string | null {
  const pro = c.reports.map(reportedProId).find(Boolean);
  if (pro) return `/admin/proveedores/${pro}`;
  const user = c.reports.find((r) => r.subject_user_id)?.subject_user_id;
  return user ? `/admin/usuarios/${user}` : null;
}

export function publicProfileHref(c: ReportCase): string | null {
  const slug = c.reports.find((r) => reportedProId(r) && r.professional_slug)?.professional_slug;
  return slug && /^[a-z0-9-]{1,120}$/i.test(slug) ? `/profesionales/${slug}` : null;
}

/** Ids con historial en moderation_actions: el contenido, la cuenta y cada reporte (case_update). */
export function historyIds(c: ReportCase): string[] {
  const ids = c.reports.flatMap((r) => [r.id, r.target_id, reportedProId(r), r.subject_user_id]);
  return [...new Set(ids.filter((id): id is string => !!id && UUID_RE.test(id)))];
}

export function relativeAge(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hace 1 día";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return m === 1 ? "hace 1 mes" : `hace ${m} meses`;
}

export function fullDate(iso: string) {
  return new Date(iso).toLocaleString("es-CR", { dateStyle: "medium", timeStyle: "short" });
}

// ── Escala de decisiones ────────────────────────────────────────────────────

export type LadderId = "warn" | "hide" | "restrict" | "block" | "none";

export type ModerationPayload = { kind: string; id: string; action: "hide" | "restore" | "warn" | "restrict" | "unrestrict"; days: number };

export const RESTRICT_DAYS = [1, 3, 7, 14] as const;
export const MAX_RESTRICT_DAYS = 30;

/** Texto entre corchetes = parte de la plantilla que el moderador debe completar. */
export const PLACEHOLDER_RE = /\[[^\]]*\]/;

const APPEAL = "Puede solicitar una revisión de esta decisión una sola vez.";

export function ladderTemplate(id: LadderId, c: ReportCase, days: number): string {
  const isPro = c.reports.some((r) => reportedProId(r));
  switch (id) {
    case "warn":
      return `Tras revisar el reporte, registramos una advertencia en su cuenta porque [describa la conducta concreta]. Si se repite, su cuenta podría restringirse. ${APPEAL}`;
    case "hide":
      return `Retiramos esta publicación porque [indique la norma incumplida]. ${APPEAL}`;
    case "restrict":
      return `Restringimos temporalmente su cuenta por ${days} ${days === 1 ? "día" : "días"} porque [describa la conducta concreta]. Durante ese plazo no podrá publicar ni enviar mensajes. ${APPEAL}`;
    case "block":
      return isPro
        ? `Retiramos su perfil profesional de la búsqueda porque [describa la infracción confirmada]. ${APPEAL}`
        : `Restringimos su cuenta por ${MAX_RESTRICT_DAYS} días, el plazo máximo, porque [describa la infracción grave confirmada]. Durante ese plazo no podrá publicar ni enviar mensajes. ${APPEAL}`;
    case "none":
      return "Revisamos el reporte y no encontramos una infracción de las normas de ContrataCR. El caso queda cerrado.";
  }
}

/** Traduce un escalón al payload existente de POST /api/admin/moderacion (sin cambiarlo). */
export function ladderPayload(id: LadderId, c: ReportCase, days: number): ModerationPayload | null {
  const account = c.reports.find((r) => r.subject_user_id)?.subject_user_id ?? null;
  const pro = c.reports.map(reportedProId).find(Boolean) ?? null;
  const content = c.reports.find((r) => r.target_id && r.target_type && ["project", "job", "offer", "review"].includes(r.target_type));
  switch (id) {
    case "warn":
      if (account) return { kind: "account", id: account, action: "warn", days: 7 };
      return c.primary.target_type && c.primary.target_id ? { kind: c.primary.target_type, id: c.primary.target_id, action: "warn", days: 7 } : null;
    case "hide":
      return content ? { kind: content.target_type!, id: content.target_id!, action: "hide", days: 7 } : null;
    case "restrict":
      return account ? { kind: "account", id: account, action: "restrict", days } : null;
    case "block":
      if (pro) return { kind: "professional", id: pro, action: "hide", days: 7 };
      return account ? { kind: "account", id: account, action: "restrict", days: MAX_RESTRICT_DAYS } : null;
    case "none":
      return null;
  }
}

/** Reporte del grupo que la RPC acepta como vínculo para esa acción (misma regla que moderate_content). */
export function linkedReport(c: ReportCase, p: Pick<ModerationPayload, "kind" | "id">): string | null {
  const match = c.reports.find(
    (r) =>
      (r.target_type === p.kind && r.target_id === p.id) ||
      (p.kind === "professional" && r.professional_id === p.id) ||
      (p.kind === "account" && r.subject_user_id === p.id),
  );
  return match?.id ?? null;
}

export const HISTORY_ACTION_LABEL: Record<string, string> = {
  hide: "Retiro de contenido",
  restore: "Restauración",
  warn: "Advertencia",
  restrict: "Restricción temporal",
  unrestrict: "Restricción retirada",
  case_update: "Actualización del caso",
  quarantine: "Adjunto en cuarentena",
  release: "Adjunto liberado",
};
