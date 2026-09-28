import { notFound } from "next/navigation";
import { ProjectsBoard } from "@/components/projects/projects-board";
import { cargarProyectoDelDueno, cargarProyectosPublicos } from "@/lib/queries/proyectos-publicos";
import { safeGetUser } from "@/lib/supabase/get-user";
import { idsDeMisProyectos } from "@/lib/queries/proyectos-publicos";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { metadatosDePantalla } from "@/lib/seo/alternates";
import { claveDeTramo, idCoincide, tramoFicha } from "@/lib/marketplace-url";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * Cada proyecto con su propio título y descripción.
 *
 * Esta pantalla no tenía `generateMetadata` en absoluto: ni título, ni
 * canonical, ni hreflang, ni tarjeta al compartir. Un proyecto mandado por
 * WhatsApp llegaba como un enlace pelado, con el título del layout, sin decir
 * de qué era —y es justo el enlace que un cliente le pasa a un profesional—.
 *
 * Se describe el trabajo, NUNCA a la persona: el tablero público no muestra
 * datos de contacto y esto no puede ser la rendija por donde se filtren.
 */
// EL ENLACE QUE SE COMPARTE ES contratacr.com/proyectos/app-movil-para-muestreos-1b93475f
// (o el corto /p/1b93475f), no el id de 36 caracteres. Era la única ficha del
// app que todavía mandaba el UUID pelado: en WhatsApp se lee como un enlace
// de máquina, no como un trabajo. El tramo puede venir de las tres formas
// —id completo, título + 8, solo 8— y aquí se resuelve igual que en
// promociones y empleos, sin ninguna columna nueva.
type Tramo = Promise<{ id: string; locale: string }>;

async function resolverProyecto(tramo: string, userId: string | undefined) {
  const clave = claveDeTramo(tramo);
  const proyectos = await cargarProyectosPublicos();
  const publico = proyectos.find((proyecto) => idCoincide(proyecto.id, tramo));
  // El dueño ve el suyo aunque ya no esté en el tablero; con solo el prefijo
  // no hay forma de buscarlo en su lista privada, así que ahí hace falta el id.
  const detalle = publico ?? (clave.id ? await cargarProyectoDelDueno(clave.id, userId) : null);
  return { proyectos, detalle };
}

export async function generateMetadata({ params }: { params: Tramo }): Promise<Metadata> {
  const { id, locale } = await params;
  if (!hasSupabaseServerConfig()) return {};
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const { detalle } = await resolverProyecto(id, user?.id);
  // Un proyecto que ya no está en el tablero no se indexa: manda gente a una
  // puerta cerrada.
  if (!detalle) return { robots: { index: false, follow: true } };
  const titulo = String(detalle.title ?? "").trim();
  const descripcion = String(detalle.description ?? "").replace(/\s+/gu, " ").trim();
  return metadatosDePantalla({
    locale,
    ruta: `/proyectos/${tramoFicha(titulo, detalle.id)}`,
    tarjetaPropia: true,
    titulo: titulo ? `${titulo} | ContrataCR` : "Proyecto | ContrataCR",
    descripcion: descripcion.slice(0, 160) || "Un cliente busca profesional para este trabajo en ContrataCR.",
  });
}

export default async function ProyectoDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ from?: string }> }) {
  const { id } = await params;
  const from = (await searchParams)?.from ?? null;
  if (!hasSupabaseServerConfig()) notFound();
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  // El tablero solo trae los abiertos. Si el proyecto ya se finalizó o se
  // canceló, su DUEÑO tiene que poder abrirlo igual —es suyo, y desde el panel
  // hay un enlace directo—: antes eso daba «página no encontrada».
  const [{ proyectos, detalle }, mios] = await Promise.all([resolverProyecto(id, user?.id), idsDeMisProyectos(supabase, user?.id)]);
  if (!detalle) notFound();
  return <ProjectsBoard proyectos={proyectos} currentUserId={user?.id ?? null} detalle={detalle} misProyectos={mios} volverA={from} />;
}
