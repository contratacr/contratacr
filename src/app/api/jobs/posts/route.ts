import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORKPLACE_TYPES } from "@/lib/jobs";
import { MAX_MONEY_AMOUNT } from "@/lib/forms/numeric-validation";
import { crTodayISO } from "@/lib/time-cr";
import { revalidatePath } from "next/cache";

const CURRENCIES = new Set(["CRC", "USD"]);
const STATUSES = new Set(["draft", "published", "paused", "closed"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
function revalidateJobViews(id?: string | null) {
  for (const locale of ["es", "en"]) {
    revalidatePath(`/${locale}/empleos`);
    revalidatePath(`/${locale}/dashboard/profesional`);
    if (id) revalidatePath(`/${locale}/empleos/${id}`);
  }
}
const cleanList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20) : [];
const optionalMoney = (value: unknown) => value == null ? null : typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_MONEY_AMOUNT ? value : undefined;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Tu sesión expiró. Inicia sesión nuevamente." }, { status: 401 });
    const employerId = typeof body.employer_id === "string" ? body.employer_id : "";
    const { data: professional } = await supabase.from("professionals").select("id").eq("id", employerId).eq("profile_id", user.id).maybeSingle();
    if (!professional) return NextResponse.json({ error: "No tienes permiso para publicar este empleo." }, { status: 403 });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const responsibilities = cleanList(body.responsibilities);
    const requirements = cleanList(body.requirements);
    const benefits = cleanList(body.benefits);
    const salaryMin = optionalMoney(body.salary_min);
    const salaryMax = optionalMoney(body.salary_max);
    const openings = body.openings;
    const deadline = body.application_deadline == null ? null : typeof body.application_deadline === "string" && ISO_DATE.test(body.application_deadline) ? body.application_deadline : undefined;
    const editingId = typeof body.id === "string" ? body.id : null;

    if (title.length < 3 || title.length > 120 || description.length < 30 || description.length > 5000 || !responsibilities.length || !requirements.length || salaryMin === undefined || salaryMax === undefined || !Number.isInteger(openings) || openings < 1 || openings > 100 || deadline === undefined || (deadline && deadline < crTodayISO())) {
      return NextResponse.json({ error: "Revisa la información del empleo e inténtalo nuevamente." }, { status: 400 });
    }
    if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) return NextResponse.json({ error: "El salario máximo debe ser mayor o igual al mínimo." }, { status: 400 });
    if (!Object.hasOwn(EMPLOYMENT_TYPES, body.employment_type) || !Object.hasOwn(EXPERIENCE_LEVELS, body.experience_level) || !Object.hasOwn(WORKPLACE_TYPES, body.workplace_type) || !Object.hasOwn(SALARY_PERIODS, body.salary_period) || !CURRENCIES.has(body.currency) || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: "El empleo contiene una opción no válida." }, { status: 400 });
    }
    const location = typeof body.location_label === "string" ? body.location_label.trim().slice(0, 200) : "";
    if (body.workplace_type !== "remote" && !location) return NextResponse.json({ error: "Indica la ubicación del empleo." }, { status: 400 });

    const payload = {
      employer_id: employerId,
      service_category_id: typeof body.service_category_id === "string" ? body.service_category_id : null,
      title,
      description,
      responsibilities,
      requirements,
      benefits,
      duration_label: typeof body.duration_label === "string" ? body.duration_label.trim().slice(0, 80) || null : null,
      employment_type: body.employment_type,
      experience_level: body.experience_level,
      workplace_type: body.workplace_type,
      location_label: body.workplace_type === "remote" ? null : location,
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_period: body.salary_period,
      currency: body.currency,
      show_salary: body.show_salary === true,
      openings,
      application_deadline: deadline,
      status: body.status,
      // El WhatsApp de ESTA vacante; nulo = el de la cuenta.
      contact_whatsapp: typeof body.contact_whatsapp === "string" ? body.contact_whatsapp.replace(/[^\d+]/gu, "").slice(0, 20) || null : null,
    };
    const guardar = (fila: Record<string, unknown>) => (editingId
      ? supabase.from("job_posts").update(fila).eq("id", editingId).eq("employer_id", employerId).select("id").maybeSingle()
      : supabase.from("job_posts").insert(fila).select("id").single());
    // La columna llega con la migración 209: si todavía no está, se guarda sin
    // ella en vez de tumbar la publicación entera.
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
      console.error("[POST /api/jobs/posts] save failed", error);
      return NextResponse.json({ error: "No pudimos guardar el empleo. Inténtalo nuevamente." }, { status: 500 });
    }
    revalidateJobViews(data.id);
    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error("[POST /api/jobs/posts] unexpected failure", error);
    return NextResponse.json({ error: "No pudimos publicar el empleo. Inténtalo nuevamente." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? body.status : "";
    if (!id || !STATUSES.has(status)) return NextResponse.json({ error: "Estado de empleo no válido." }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { data: job } = await supabase.from("job_posts").select("employer_id, professionals!inner(profile_id)").eq("id", id).maybeSingle();
    const owner = job?.professionals as unknown as { profile_id?: string } | null;
    if (!job || owner?.profile_id !== user.id) return NextResponse.json({ error: "No tienes permiso para modificar este empleo." }, { status: 403 });
    const { error } = await supabase.from("job_posts").update({ status }).eq("id", id).eq("employer_id", job.employer_id);
    if (error) throw error;
    revalidateJobViews(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/jobs/posts] status update failed", error);
    return NextResponse.json({ error: "No pudimos actualizar el empleo." }, { status: 500 });
  }
}
