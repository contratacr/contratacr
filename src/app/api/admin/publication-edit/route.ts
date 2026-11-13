import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { moderationAccess } from "@/lib/moderation/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditUserAction } from "@/lib/audit/user-action";
import { rutasDeCache } from "@/lib/prefijo-de-idioma";
import { PUBLICATION_TABLE, validatePublicationEdit } from "@/lib/admin/publication-edit";

// PATCH /api/admin/publication-edit { kind: job|offer|project, id, title, description }
//
// Un administrador corrige el título y la descripción de una publicación
// ajena. Lo puede hacer quien ya puede pausar o retirar publicaciones (permiso
// de moderación). El cambio queda en la bitácora con el antes y el después.
// Una publicación retirada por moderación no se edita: la base la protege
// (migración 261) y primero hay que restaurarla.

const PATHS = { job: "/empleos", offer: "/promociones", project: "/proyectos" } as const;

export async function PATCH(request: Request) {
  const access = await moderationAccess();
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origen inválido" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Identificador requerido." }, { status: 400 });
  const checked = validatePublicationEdit(body?.kind, body ?? {});
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const { kind, value } = checked;
  const table = PUBLICATION_TABLE[kind];
  const ownerColumn = kind === "job" ? "employer_id" : kind === "offer" ? "professional_id" : "client_id";
  const db = createAdminClient();
  const { data: before, error: readError } = await db.from(table).select(`id, title, description, ${ownerColumn}`).eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: "No se pudo leer la publicación." }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Publicación no encontrada." }, { status: 404 });
  const row = { ...(before as unknown as Record<string, string | null>) };
  if (row.title === value.title && (row.description ?? "") === value.description) {
    return NextResponse.json({ id, ...value, unchanged: true });
  }

  const { error } = await db.from(table).update(value).eq("id", id);
  if (error) {
    // 42501: retirada por moderación o cuenta restringida (trigger de la 261).
    if (error.code === "42501") return NextResponse.json({ error: "Esta publicación está retirada por moderación o su cuenta está restringida. Restáurala antes de editarla." }, { status: 409 });
    console.error("[admin/publication-edit]", kind, error.code, error.message);
    return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 500 });
  }

  let ownerUserId: string | null = kind === "project" ? row.client_id ?? null : null;
  if (kind !== "project" && row[ownerColumn]) {
    const { data: pro } = await db.from("professionals").select("profile_id").eq("id", row[ownerColumn] as string).maybeSingle();
    ownerUserId = (pro as { profile_id?: string | null } | null)?.profile_id ?? null;
  }
  await auditUserAction(db, request, {
    actorUserId: access.admin.id,
    actorRole: "admin",
    action: `${kind}.admin_edit`,
    entityTable: table,
    entityId: id,
    entityOwnerUserId: ownerUserId,
    beforeData: { title: row.title, description: row.description },
    afterData: value,
  });

  for (const locale of ["es", "en"]) {
    for (const path of rutasDeCache(locale, PATHS[kind])) revalidatePath(path);
    for (const path of rutasDeCache(locale, `${PATHS[kind]}/${id}`)) revalidatePath(path);
    if (kind === "offer") for (const path of rutasDeCache(locale, "/profesionales/[slug]")) revalidatePath(path, "page");
  }
  return NextResponse.json({ id, ...value });
}
