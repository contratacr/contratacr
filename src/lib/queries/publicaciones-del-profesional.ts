import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProfessionalOffer } from "@/lib/offers";
import type { JobPost } from "@/lib/jobs";

/**
 * Las promociones y los empleos de un profesional, PINTADOS POR EL SERVIDOR.
 *
 * Las pedía el navegador al montar, así que la fila de pestañas de la ficha
 * nacía con cinco y pasaba a siete —«Promociones» y «Empleos» entraban tarde— y
 * todo lo de al lado se corría de sitio. Es el mismo parpadeo de siempre: lo que
 * el servidor sabe, lo pinta el servidor.
 *
 * Las mismas columnas y los mismos filtros que usaba el cliente, para que lo que
 * llega después de revalidar sea idéntico a lo que ya está en pantalla.
 */
const COLUMNAS_OFERTAS = "id, professional_id, service_category_id, title, description, offer_type, service_label, image_urls, price_now, price_before, currency, price_unit, location_label, valid_until, quantity_available, status, created_at";
const COLUMNAS_EMPLEOS = "id, employer_id, service_category_id, duration_label, experience_level, title, description, responsibilities, requirements, benefits, employment_type, workplace_type, provincia_id, canton_id, location_label, salary_min, salary_max, salary_period, currency, show_salary, openings, application_deadline, status, created_at";

export async function publicacionesDelProfesional(professionalId: string): Promise<{ ofertas: ProfessionalOffer[]; empleos: JobPost[] }> {
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const [ofertas, empleos] = await Promise.all([
    supabase.from("professional_offers").select(COLUMNAS_OFERTAS)
      .eq("professional_id", professionalId).eq("status", "published")
      .order("created_at", { ascending: false }).limit(8),
    supabase.from("job_posts").select(COLUMNAS_EMPLEOS)
      .eq("employer_id", professionalId).eq("status", "published")
      .order("created_at", { ascending: false }).limit(8),
  ]);
  return {
    ofertas: ((ofertas.data ?? []) as unknown as ProfessionalOffer[]).filter((o) => !o.valid_until || o.valid_until >= hoy),
    empleos: ((empleos.data ?? []) as unknown as JobPost[]).filter((e) => !e.application_deadline || e.application_deadline >= hoy),
  };
}
