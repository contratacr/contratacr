import { appEnvironment, getSupabaseProjectRef, requestHost } from "@/lib/security/write-guard";

export type AuditUserActionInput = {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityTable: string;
  entityId?: string | null;
  entityOwnerUserId?: string | null;
  source?: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export function requestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip");
}

export function requestPath(req: Request) {
  try {
    const url = new URL(req.url);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function auditRequestMetadata(req: Request) {
  return {
    request_method: req.method,
    request_path: requestPath(req),
    request_host: requestHost(req),
    request_ip: requestIp(req),
    user_agent: req.headers.get("user-agent"),
    referer: req.headers.get("referer"),
    app_environment: appEnvironment(req),
    supabase_project_ref: getSupabaseProjectRef(),
  };
}

export async function auditUserAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  req: Request,
  input: AuditUserActionInput
) {
  try {
    const { error } = await db.from("user_action_audit").insert({
      actor_user_id: input.actorUserId ?? null,
      actor_role: input.actorRole ?? null,
      action: input.action,
      entity_table: input.entityTable,
      entity_id: input.entityId ?? null,
      entity_owner_user_id: input.entityOwnerUserId ?? input.actorUserId ?? null,
      source: input.source ?? "api",
      before_data: input.beforeData ?? null,
      after_data: input.afterData ?? null,
      metadata: input.metadata ?? {},
      ...auditRequestMetadata(req),
    });
    if (error) console.error("[audit] insert failed:", error.message);
  } catch (err) {
    console.error("[audit] insert failed:", err);
  }
}
