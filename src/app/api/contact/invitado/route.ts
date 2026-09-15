import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { writeSourceColumns } from "@/lib/security/write-guard";
import { limitTrimmedText } from "@/lib/text-limits";
import { getCategoryLabel } from "@/lib/data/categories";

/**
 * Avisarle al profesional que alguien lo buscó.
 *
 * No pide NADA: el toque abre WhatsApp y este aviso sale solo. El formulario de
 * nombre y teléfono que hubo aquí un rato se quitó porque cobraba fricción por
 * un dato que el profesional recibe igual —WhatsApp le muestra el número de
 * quien le escribe—. Quien tiene sesión entra con su nombre, y ahí sí se
 * guarda.
 *
 * Lo que protege contra el raspado no es este endpoint sino que los números NO
 * viajan en el listado ni en la API de resultados, más el tope por IP. Un
 * humano pide uno o dos contactos; un raspador pide cincuenta.
 */
export const dynamic = "force-dynamic";

const NOMBRE_MAX = 80;

function telefonoLimpio(valor: unknown) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  // Costa Rica: ocho dígitos, o con el 506 adelante.
  if (digitos.length === 8) return `+506${digitos}`;
  if (digitos.length === 11 && digitos.startsWith("506")) return `+${digitos}`;
  if (digitos.length >= 10 && digitos.length <= 15) return `+${digitos}`;
  return null;
}

export async function POST(req: Request) {
  // Doce contactos por hora desde una misma salida a internet: de sobra para
  // una casa o una oficina, insuficiente para llevarse la lista.
  const limitado = enforceRateLimit(req, "contacto-invitado", 12, 3_600_000);
  if (limitado) return limitado;

  const cuerpo = await req.json().catch(() => ({})) as {
    professionalId?: unknown; nombre?: unknown; telefono?: unknown;
    canal?: unknown; categoriaId?: unknown; locale?: unknown; visitorHash?: unknown;
  };

  const professionalId = String(cuerpo.professionalId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(professionalId)) {
    return NextResponse.json({ error: "Profesional inválido." }, { status: 400 });
  }
  const canal = ["whatsapp", "phone", "email"].includes(String(cuerpo.canal)) ? String(cuerpo.canal) : "whatsapp";
  const locale = String(cuerpo.locale) === "en" ? "en" : "es";
  const categoriaId = limitTrimmedText(String(cuerpo.categoriaId ?? ""), 60) || null;

  const db = createAdminClient();
  const { data: profesional } = await db
    .from("professionals")
    .select("id, profile_id, is_banned")
    .eq("id", professionalId)
    .maybeSingle();
  const fila = profesional as null | { profile_id: string; is_banned?: boolean | null };
  if (!fila || fila.is_banned) {
    return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
  }

  // Con sesión sabemos quién es sin preguntarle nada; sin sesión, el aviso sale
  // igual y el número se lo entrega WhatsApp.
  const visitante = await createClient().then((sb) => safeGetUser(sb)).catch(() => null);
  let nombre: string | null = null;
  let telefono: string | null = null;
  if (visitante) {
    const { data: perfil } = await db.from("profiles").select("full_name, phone").eq("id", visitante.id).maybeSingle();
    nombre = limitTrimmedText(String((perfil as { full_name?: string } | null)?.full_name ?? ""), NOMBRE_MAX) || null;
    telefono = telefonoLimpio((perfil as { phone?: string } | null)?.phone);
  }

  await db.from("contact_leads").insert({
    professional_id: professionalId,
    name: nombre,
    phone: telefono,
    channel: canal,
    category_id: categoriaId,
    client_id: visitante?.id ?? null,
    visitor_hash: limitTrimmedText(String(cuerpo.visitorHash ?? ""), 64) || null,
    locale,
    ...writeSourceColumns(req),
  });

  // El profesional se entera AHORA, no cuando abra el app: es una persona con
  // teléfono esperando respuesta. El texto se arma al leerlo, en el idioma de
  // quien lo lee: aquí solo van los datos.
  const servicio = categoriaId ? getCategoryLabel(categoriaId, locale) : "";
  const { error: errorAviso } = await db.from("notifications").insert({
    user_id: fila.profile_id,
    type: "contact_lead",
    title: "Alguien quiere contactarte",
    message: [nombre, telefono].filter(Boolean).join(" · ") || servicio || "",
    data: {
      link: "/es/dashboard/profesional?tab=contactos",
      lead_name: nombre,
      lead_phone: telefono,
      category_label: servicio || null,
      channel: canal,
    },
  });
  if (errorAviso) console.error("[contacto-invitado] no se pudo avisar", { code: errorAviso.code });

  // No devuelve el número: de eso se encargan /api/contact/whatsapp-link y
  // /api/contact/reveal, que son los que ya arman el saludo y llevan la cuenta
  // del seguimiento. Aquí lo único que pasa es que el profesional se entera.
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
