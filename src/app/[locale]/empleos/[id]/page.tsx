import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { metadatosDePantalla } from "@/lib/seo/alternates";
import { marketplaceReturnLabelKey, safeMarketplaceReturnHref } from "@/lib/navigation/marketplace-return";
import { JobsPageContent } from "../page";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// UN EMPLEO CERRADO NO DESAPARECE: DICE QUE SE CERRÓ.
//
// Esta pantalla reutiliza el tablero, que solo trae los publicados, y el
// tablero elegía `filtered[0]` cuando no encontraba el pedido. Un enlace de una
// vacante cerrada —compartido por WhatsApp, guardado en Google— abría OTRA
// vacante distinta, con HTTP 200 y sin decir una palabra. Medido:
// /es/empleos/<id-que-no-existe> devolvía «Estudio Delta: empleo published».
//
// Ahora hay tres desenlaces, y son los de LinkedIn: publicado, su ficha; cerrado
// o pausado, una lápida que lo dice y una puerta hacia adentro; inexistente,
// «página no encontrada». La lápida se lee con la llave de servicio porque los
// permisos de la base solo dejan ver las publicadas, y sale con `noindex` para
// que Google suelte la vacante muerta en vez de seguir mandándole gente.

type Props = {
  params: Promise<{ id: string; locale: string }>;
  searchParams?: Promise<{ from?: string }>;
};

/** Lo mínimo para la lápida. Nada de contacto: ya no hay a quién escribirle. */
async function empleoCerrado(id: string) {
  const { data } = await createAdminClient()
    .from("job_posts")
    .select("id, title, status, location_label, professionals!job_posts_employer_id_fkey(business_name,profiles(full_name))")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  if (!hasSupabaseServerConfig()) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("job_posts").select("id, title, location_label, description").eq("id", id).eq("status", "published").maybeSingle();
  // Solo la vacante viva se indexa. La cerrada se marca para que salga del
  // buscador: dejarla indexada manda gente a una puerta que ya está cerrada.
  if (!data) return { robots: { index: false, follow: true } };
  // Cada vacante con su propio título y descripción: antes todas compartían
  // los del tablero y Google no tenía nada con qué distinguirlas.
  const { locale } = await params;
  const en = locale === "en";
  const lugar = (data as { location_label?: string | null }).location_label;
  const titulo = `${(data as { title: string }).title}${lugar ? ` · ${lugar}` : ""} | ContrataCR`;
  const cuerpo = String((data as { description?: string | null }).description ?? "").replace(/\s+/g, " ").trim();
  const descripcion = cuerpo ? cuerpo.slice(0, 155) : (en ? "Job opening in Costa Rica. Open the posting and message whoever published it on WhatsApp." : "Vacante en Costa Rica. Abre la publicación y escríbele por WhatsApp a quien la publicó.");
  return metadatosDePantalla({ locale, ruta: `/empleos/${id}`, titulo, descripcion });
}

export default async function JobDetailRedirect({ params, searchParams }: Props) {
  const { id } = await params;
  const from = (await searchParams)?.from;
  if (!hasSupabaseServerConfig()) notFound();
  const supabase = await createClient();
  const { data: publicado } = await supabase
    .from("job_posts")
    .select("id")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (publicado) {
    // JobPosting: el esquema que Google for Jobs necesita para listar la vacante.
    const { data: vacante } = await createAdminClient()
      .from("job_posts")
      .select("title, description, employment_type, created_at, location_label, professionals!job_posts_employer_id_fkey(business_name,profiles(full_name))")
      .eq("id", id)
      .maybeSingle();
    const empleadorDeVacante = vacante?.professionals as { business_name?: string | null; profiles?: { full_name?: string | null } | null } | null | undefined;
    const tipoEmpleo: Record<string, string> = { full_time: "FULL_TIME", part_time: "PART_TIME", contract: "CONTRACTOR", temporary: "TEMPORARY", internship: "INTERN", freelance: "CONTRACTOR" };
    const jobPosting = vacante ? {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: vacante.title,
      description: vacante.description || vacante.title,
      datePosted: vacante.created_at,
      employmentType: tipoEmpleo[String(vacante.employment_type ?? "")] ?? undefined,
      hiringOrganization: { "@type": "Organization", name: empleadorDeVacante?.business_name || empleadorDeVacante?.profiles?.full_name || "ContrataCR" },
      jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: vacante.location_label || "Costa Rica", addressCountry: "CR" } },
    } : null;
    return (
      <>
        {jobPosting && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPosting) }} />}
        <JobsPageContent initialSelectedJobId={id} returnTo={from} detailOnly />
      </>
    );
  }

  const cerrado = await empleoCerrado(id);
  if (!cerrado) notFound();

  const t = await getTranslations("empleoCerrado");
  // La lápida también vuelve a donde se vino: desde el panel, a la lista
  // exacta (pestaña y etapa); sin origen, a todos los empleos.
  const tSalida = await getTranslations("marketplaceReturn");
  const volverHref = safeMarketplaceReturnHref(from, "/empleos");
  const volverTexto = from ? tSalida(marketplaceReturnLabelKey(volverHref, "/empleos")) : t("backAll");
  const empleador = (cerrado.professionals as { business_name?: string | null; profiles?: { full_name?: string | null } | null } | null);
  const nombre = empleador?.business_name || empleador?.profiles?.full_name || null;

  return (
    <main className="min-h-[calc(100vh-72px)] bg-white text-[#162543] sm:bg-[#f4f7fa]">
      {/* Las mismas medidas que la ficha de un empleo vivo: 6xl, la columna de
          760 centrada. La lápida no es otra pantalla, es la misma sin acciones. */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
        {/* EN COMPUTADORA NO HAY FLECHA DE VOLVER, NUNCA: la del navegador ya
            está a la izquierda de la dirección y hace exactamente eso. En el
            teléfono sí, que ahí no hay otra. */}
        <Link href={volverHref} aria-label={volverTexto} className="mb-3 inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-extrabold text-[#162543] transition hover:bg-[#eaf6fc] lg:hidden">
          <ArrowLeft className="h-4 w-4 stroke-[2.4]" />
          {volverTexto}
        </Link>
        {/* FLEX CON UTILIDADES NORMALES, NO UNA REJILLA CON VALOR ARBITRARIO.
            `lg:grid-cols-[minmax(0,1fr)_320px]` depende de que Tailwind genere
            esa clase; donde no la generó, quedaba `lg:grid` con una sola
            columna y las dos tarjetas salían APILADAS, una debajo de la otra.
            `lg:flex` + `lg:flex-1` + `lg:w-80` son utilidades de siempre: no
            hay nada que generar y no hay forma de que degrade. */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <article className="min-w-0 rounded-lg border border-[#e5e7eb] bg-white p-6 sm:p-7 lg:flex-1">
            {nombre && <p className="font-semibold text-[#52627a]">{nombre}</p>}
            <h1 className="mt-0.5 text-2xl font-extrabold leading-tight text-[#162543]">{cerrado.title}</h1>
            {cerrado.location_label && <p className="mt-1 text-sm text-[#68778d]">{cerrado.location_label}</p>}
            {/* En computadora el aviso vive en la tarjeta de la derecha, donde
                iría el salario: repetido en las dos se leía como un error. */}
            <p className="mt-5 rounded-lg bg-[#f4f7fa] p-4 text-sm font-bold lg:hidden">{t("unavailable")}</p>
          </article>
          <aside className="hidden h-fit w-80 shrink-0 rounded-lg border border-[#e5e7eb] bg-white p-5 lg:block">
            <p className="text-xs font-bold uppercase tracking-wide text-[#7a899d]">{t("heading")}</p>
            <p className="mt-3 rounded-lg bg-[#f4f7fa] p-4 text-sm font-bold">{t("unavailable")}</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
