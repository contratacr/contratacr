import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_MONEY_AMOUNT, MAX_OFFER_QUANTITY } from "@/lib/forms/numeric-validation";
import { OFFER_PRICE_UNITS, OFFER_TYPES, sanitizeOfferImages } from "@/lib/offers";
import { crTodayISO } from "@/lib/time-cr";
import { revalidatePath } from "next/cache";

const STATUSES = new Set(["draft", "published", "paused", "expired", "sold_out"]);
const CURRENCIES = new Set(["CRC", "USD"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function revalidateOfferViews(id?: string | null) {
  for (const locale of ["es", "en"]) {
    revalidatePath(`/${locale}/ofertas`);
    revalidatePath(`/${locale}/dashboard/profesional`);
    revalidatePath(`/${locale}/profesionales/[slug]`, "page");
    if (id) revalidatePath(`/${locale}/ofertas/${id}`);
  }
}

function integer(value: unknown, minimum: number, maximum: number, nullable = false) {
  if (nullable && (value === null || value === "" || value === undefined)) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Tu sesión expiró. Inicia sesión nuevamente." }, { status: 401 });

    const professionalId = typeof body.professional_id === "string" ? body.professional_id : "";
    const { data: professional } = await supabase.from("professionals").select("id").eq("id", professionalId).eq("profile_id", user.id).maybeSingle();
    if (!professional) return NextResponse.json({ error: "No tienes permiso para publicar esta oferta." }, { status: 403 });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const images = sanitizeOfferImages(Array.isArray(body.image_urls) ? body.image_urls.filter((value: unknown): value is string => typeof value === "string") : []);
    // Sin precio = «a convenir». Antes era obligatorio y la gente ponía 1.
    const priceNow = integer(body.price_now, 1, MAX_MONEY_AMOUNT, true);
    const priceBefore = integer(body.price_before, 1, MAX_MONEY_AMOUNT, true);
    const quantity = integer(body.quantity_available, 1, MAX_OFFER_QUANTITY, true);
    const validUntil = body.valid_until == null ? null : typeof body.valid_until === "string" && ISO_DATE.test(body.valid_until) ? body.valid_until : undefined;
    const editingId = typeof body.id === "string" ? body.id : null;

    if (title.length < 3 || title.length > 120 || description.length < 20 || description.length > 3000 || images.length < 1 || priceNow === undefined || priceBefore === undefined || quantity === undefined || validUntil === undefined || (validUntil && validUntil < crTodayISO())) {
      return NextResponse.json({ error: "Revisa la información de la oferta e inténtalo nuevamente." }, { status: 400 });
    }
    if (priceBefore !== null && priceNow !== null && priceBefore < priceNow) return NextResponse.json({ error: "El precio anterior debe ser mayor o igual al actual." }, { status: 400 });
    if (!Object.hasOwn(OFFER_TYPES, body.offer_type) || !Object.hasOwn(OFFER_PRICE_UNITS, body.price_unit) || !CURRENCIES.has(body.currency) || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: "La oferta contiene una opción no válida." }, { status: 400 });
    }

    const payload = {
      professional_id: professionalId,
      service_category_id: typeof body.service_category_id === "string" ? body.service_category_id : null,
      title,
      description,
      offer_type: body.offer_type,
      service_label: typeof body.service_label === "string" ? body.service_label.trim().slice(0, 160) : null,
      image_urls: images,
      price_now: priceNow,
      // Sin precio actual no hay «antes» que comparar.
      price_before: priceNow === null ? null : priceBefore,
      currency: body.currency,
      price_unit: body.price_unit,
      location_label: typeof body.location_label === "string" ? body.location_label.trim().slice(0, 200) || null : null,
      valid_until: validUntil,
      // El WhatsApp de ESTA promoción; nulo = el de la cuenta.
      contact_whatsapp: typeof body.contact_whatsapp === "string" ? body.contact_whatsapp.replace(/[^\d+]/gu, "").slice(0, 20) || null : null,
      quantity_available: quantity,
      status: body.status,
    };
    const guardar = (fila: Record<string, unknown>) => (editingId
      ? supabase.from("professional_offers").update(fila).eq("id", editingId).eq("professional_id", professionalId).select("id").maybeSingle()
      : supabase.from("professional_offers").insert(fila).select("id").single());
    // La columna llega con la migración 209; sin ella se guarda igual.
    let { data, error } = await guardar(payload);
    // PostgREST responde PGRST204 cuando la columna no está en su caché de
    // esquema y 42703 cuando no existe en la base: las dos valen.
    // Ante CUALQUIER error se reintenta sin la columna nueva, no solo ante los
    // códigos conocidos (42703, PGRST204): si producción responde otra cosa
    // —un permiso por columna, por ejemplo—, publicar no puede depender de
    // adivinar el mensaje. Si el error era otro, el reintento falla igual y se
    // informa abajo.
    if (error) {
      console.error("[publicar] primer intento falló; se reintenta sin contact_whatsapp", error.code, error.message);
      const { contact_whatsapp: _sinColumna, ...resto } = payload;
      void _sinColumna;
      ({ data, error } = await guardar(resto));
    }
    if (error || !data?.id) {
      console.error("[POST /api/offers] save failed", error);
      return NextResponse.json({ error: "No pudimos guardar la oferta. Inténtalo nuevamente." }, { status: 500 });
    }
    revalidateOfferViews(data.id);
    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error("[POST /api/offers] unexpected failure", error);
    return NextResponse.json({ error: "No pudimos publicar la oferta. Inténtalo nuevamente." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? body.status : "";
    if (!id || !STATUSES.has(status)) return NextResponse.json({ error: "Estado de oferta no válido." }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { data: offer } = await supabase.from("professional_offers").select("professional_id, valid_until, professionals!inner(profile_id)").eq("id", id).maybeSingle();
    const owner = offer?.professionals as unknown as { profile_id?: string } | null;
    if (!offer || owner?.profile_id !== user.id) return NextResponse.json({ error: "No tienes permiso para modificar esta oferta." }, { status: 403 });
    // Volver a publicar una promoción con la vigencia ya pasada la dejaba
    // «publicada» y aun así fuera del tablero, que filtra por fecha: el botón
    // decía una cosa y pasaba otra. Al republicar se le quita la fecha de
    // vencimiento; el profesional puede ponerle otra al editarla.
    const vencida = typeof (offer as { valid_until?: string | null }).valid_until === "string"
      && String((offer as { valid_until?: string | null }).valid_until) < crTodayISO();
    const cambios: Record<string, unknown> = { status };
    if (status === "published" && vencida) cambios.valid_until = null;
    const { error } = await supabase.from("professional_offers").update(cambios).eq("id", id).eq("professional_id", offer.professional_id);
    if (error) throw error;
    revalidateOfferViews(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/offers] status update failed", error);
    return NextResponse.json({ error: "No pudimos actualizar la oferta." }, { status: 500 });
  }
}
