import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditUserAction } from "@/lib/audit/user-action";
import { whatsappDigits } from "@/lib/quotes";
import { enviarEnlaceDeContrasena, requestOrigin } from "@/lib/auth/enlace-de-contrasena";

/**
 * EDITAR LOS DATOS DE UNA CUENTA DESDE EL ADMIN (7-oct-2026).
 *
 * Para cuando alguien escribe a soporte porque cambió de número o de correo y no
 * puede hacerlo solo. Antes se arreglaba a mano contra la base.
 *
 * - Nombre, nombre comercial, WhatsApp y teléfono de llamadas se cambian directo.
 *   El WhatsApp nuevo también entra en sus empleos y promociones que tenían el
 *   número viejo: cada publicación guarda su propio número de contacto.
 * - El correo cambia en Auth y en el perfil; la persona entra con el nuevo.
 * - La contraseña NUNCA la escribe el admin: se le manda a la persona el enlace
 *   de «olvidé mi contraseña» para que la cambie ella.
 * - Cada cambio queda en `user_action_audit`: quién, cuándo, antes y después.
 */

const ACCION_DATOS = "admin_edit_user_data";
const ACCION_CONTRASENA = "admin_password_reset_link";
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Cambios = {
  full_name?: string;
  business_name?: string;
  whatsapp?: string;
  call_phone?: string;
  email?: string;
};

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" ? valor.trim() : undefined;
}

function telefonoValido(digitos: string) {
  return digitos.length >= 10 && digitos.length <= 15;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  const db = createAdminClient();

  const { data: filas, error } = await db
    .from("user_action_audit")
    .select("id, created_at, action, actor_user_id, before_data, after_data, metadata")
    .eq("entity_owner_user_id", id)
    .in("action", [ACCION_DATOS, ACCION_CONTRASENA])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[admin/user-datos] historial:", error.message);
    return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 });
  }

  const actores = [...new Set((filas ?? []).map((f) => f.actor_user_id).filter((x): x is string => !!x))];
  const nombres = new Map<string, string>();
  if (actores.length) {
    const { data: perfiles } = await db.from("profiles").select("id, full_name, email").in("id", actores);
    for (const p of perfiles ?? []) nombres.set(p.id, p.full_name || p.email || "Admin");
  }

  return NextResponse.json({
    historial: (filas ?? []).map((f) => ({
      id: f.id,
      fecha: f.created_at,
      accion: f.action,
      quien: f.actor_user_id ? nombres.get(f.actor_user_id) ?? "Admin" : "Admin",
      antes: f.before_data ?? {},
      despues: f.after_data ?? {},
      detalle: f.metadata ?? {},
    })),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const pedidos: Cambios = {
    full_name: texto(body.full_name),
    business_name: texto(body.business_name),
    whatsapp: texto(body.whatsapp),
    call_phone: texto(body.call_phone),
    email: texto(body.email)?.toLowerCase(),
  };

  const db = createAdminClient();
  const { data: perfil } = await db.from("profiles").select("id, full_name, email, phone").eq("id", id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  const { data: pros } = await db
    .from("professionals")
    .select("id, business_name, whatsapp, call_phone")
    .eq("profile_id", id);
  const pro = pros?.[0] ?? null;

  // Solo cuenta lo que de verdad cambia: un formulario reenviado sin tocar nada
  // no debe dejar una fila vacía en el historial.
  const antes: Record<string, string | null> = {};
  const despues: Record<string, string | null> = {};
  const anotar = (campo: string, viejo: string | null | undefined, nuevo: string) => {
    if ((viejo ?? "") === nuevo) return false;
    antes[campo] = viejo ?? null;
    despues[campo] = nuevo || null;
    return true;
  };

  if (pedidos.full_name !== undefined) {
    if (!pedidos.full_name) return NextResponse.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
    anotar("nombre", perfil.full_name, pedidos.full_name);
  }
  if (pedidos.business_name !== undefined && pro) {
    if (!pedidos.business_name) return NextResponse.json({ error: "El nombre comercial no puede quedar vacío." }, { status: 400 });
    anotar("nombre_comercial", pro.business_name, pedidos.business_name);
  }

  const waViejo = whatsappDigits(pro?.whatsapp || perfil.phone);
  let waNuevo: string | undefined;
  if (pedidos.whatsapp !== undefined) {
    waNuevo = whatsappDigits(pedidos.whatsapp);
    // Un profesional sin WhatsApp no puede recibir contactos: no se deja vacío.
    if (waNuevo ? !telefonoValido(waNuevo) : !!pro) {
      return NextResponse.json({ error: "Escribe un número de WhatsApp completo." }, { status: 400 });
    }
    if (!anotar("whatsapp", waViejo, waNuevo)) waNuevo = undefined;
  }

  let llamadasNuevo: string | undefined;
  if (pedidos.call_phone !== undefined && pro) {
    llamadasNuevo = whatsappDigits(pedidos.call_phone);
    if (llamadasNuevo && !telefonoValido(llamadasNuevo)) {
      return NextResponse.json({ error: "Escribe un teléfono de llamadas completo." }, { status: 400 });
    }
    if (!anotar("telefono_llamadas", whatsappDigits(pro.call_phone), llamadasNuevo)) llamadasNuevo = undefined;
  }

  let correoNuevo: string | undefined;
  if (pedidos.email !== undefined) {
    if (!CORREO_VALIDO.test(pedidos.email)) return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });
    if (anotar("correo", perfil.email?.toLowerCase(), pedidos.email)) {
      const { data: otro } = await db.from("profiles").select("id").ilike("email", pedidos.email).neq("id", id).limit(1);
      if ((otro ?? []).length) return NextResponse.json({ error: "Ese correo ya lo usa otra cuenta." }, { status: 409 });
      correoNuevo = pedidos.email;
    }
  }

  if (!Object.keys(despues).length) return NextResponse.json({ ok: true, sinCambios: true });

  // El correo va primero: es lo único que puede rechazar Auth, y si falla no
  // conviene dejar el resto a medias.
  if (correoNuevo) {
    const { error } = await db.auth.admin.updateUserById(id, { email: correoNuevo, email_confirm: true });
    if (error) {
      console.error("[admin/user-datos] correo:", error.message);
      const ocupado = /already|registered|exists/i.test(error.message);
      return NextResponse.json({ error: ocupado ? "Ese correo ya lo usa otra cuenta." : "No se pudo cambiar el correo." }, { status: ocupado ? 409 : 500 });
    }
  }

  const perfilNuevo: Record<string, string | null> = {};
  if ("nombre" in despues) perfilNuevo.full_name = pedidos.full_name!;
  if (waNuevo !== undefined) perfilNuevo.phone = waNuevo || null;
  if (correoNuevo) perfilNuevo.email = correoNuevo;
  if (Object.keys(perfilNuevo).length) {
    const { error } = await db.from("profiles").update(perfilNuevo).eq("id", id);
    if (error) {
      console.error("[admin/user-datos] perfil:", error.message);
      return NextResponse.json({ error: "No se pudieron guardar los datos." }, { status: 500 });
    }
  }
  if ("nombre" in despues) {
    // El nombre también vive en los metadatos de Auth (lo leen el onboarding y los correos).
    const { data: authUser } = await db.auth.admin.getUserById(id);
    const metadatos = authUser?.user?.user_metadata ?? {};
    await db.auth.admin.updateUserById(id, { user_metadata: { ...metadatos, full_name: pedidos.full_name } });
  }

  let empleos = 0;
  let promociones = 0;
  for (const p of pros ?? []) {
    const filaPro: Record<string, string | null> = {};
    if ("nombre_comercial" in despues) filaPro.business_name = pedidos.business_name!;
    if (waNuevo) filaPro.whatsapp = waNuevo;
    if (llamadasNuevo !== undefined) filaPro.call_phone = llamadasNuevo || null;
    // Si las llamadas iban al mismo número viejo, siguen al nuevo.
    else if (waNuevo && whatsappDigits(p.call_phone) === waViejo) filaPro.call_phone = waNuevo;
    if (Object.keys(filaPro).length) {
      const { error } = await db.from("professionals").update(filaPro).eq("id", p.id);
      if (error) {
        console.error("[admin/user-datos] profesional:", error.message);
        return NextResponse.json({ error: "No se pudo guardar el perfil profesional." }, { status: 500 });
      }
    }
    if (waNuevo && waViejo) {
      // Solo las publicaciones que tenían el número viejo: una con otro número
      // a propósito (la de un encargado, por ejemplo) se respeta.
      for (const [tabla, dueno] of [["job_posts", "employer_id"], ["professional_offers", "professional_id"]] as const) {
        const { data: filas } = await db.from(tabla).select("id, contact_whatsapp").eq(dueno, p.id);
        const ids = (filas ?? []).filter((f) => whatsappDigits(f.contact_whatsapp) === waViejo).map((f) => f.id);
        if (!ids.length) continue;
        const { error } = await db.from(tabla).update({ contact_whatsapp: waNuevo }).in("id", ids);
        if (error) console.error(`[admin/user-datos] ${tabla}:`, error.message);
        else if (tabla === "job_posts") empleos += ids.length;
        else promociones += ids.length;
      }
    }
  }

  await auditUserAction(db, req, {
    actorUserId: admin.id,
    actorRole: "admin",
    action: ACCION_DATOS,
    entityTable: "profiles",
    entityId: id,
    entityOwnerUserId: id,
    source: "admin",
    beforeData: antes,
    afterData: despues,
    metadata: { empleos_actualizados: empleos, promociones_actualizadas: promociones },
  });

  return NextResponse.json({ ok: true, cambios: Object.keys(despues), empleos, promociones });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.accion !== "enlace_contrasena") return NextResponse.json({ error: "Acción inválida." }, { status: 400 });

  const db = createAdminClient();
  const { data: perfil } = await db.from("profiles").select("email").eq("id", id).maybeSingle();
  if (!perfil?.email) return NextResponse.json({ error: "Esta cuenta no tiene correo." }, { status: 400 });

  // El mismo correo de «olvidé mi contraseña»: le llega a la persona y abre la
  // pantalla donde ella elige la contraseña nueva, desde cualquier dispositivo.
  const resultado = await enviarEnlaceDeContrasena({ email: perfil.email, origin: requestOrigin(req), resetPath: "/reset-password" });
  if (resultado !== "ok") {
    console.error("[admin/user-datos] enlace de contraseña:", resultado);
    return NextResponse.json({ error: "No se pudo mandar el enlace. Intenta de nuevo en un momento." }, { status: 502 });
  }

  await auditUserAction(db, req, {
    actorUserId: admin.id,
    actorRole: "admin",
    action: ACCION_CONTRASENA,
    entityTable: "profiles",
    entityId: id,
    entityOwnerUserId: id,
    source: "admin",
    afterData: { enlace_enviado_a: perfil.email },
  });
  return NextResponse.json({ ok: true, correo: perfil.email });
}
