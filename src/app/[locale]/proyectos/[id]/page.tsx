import { notFound } from "next/navigation";
import { ProjectsBoard } from "@/components/projects/projects-board";
import { cargarProyectoDelDueno, cargarProyectosPublicos } from "@/lib/queries/proyectos-publicos";
import { safeGetUser } from "@/lib/supabase/get-user";
import { idsDeMisProyectos } from "@/lib/queries/proyectos-publicos";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { metadatosDePantalla } from "@/lib/seo/alternates";
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
export async function generateMetadata({ params }: { params: Promise<{ id: string; locale: string }> }): Promise<Metadata> {
  const { id, locale } = await params;
  if (!hasSupabaseServerConfig()) return {};
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const proyectos = await cargarProyectosPublicos();
  const detalle = proyectos.find((proyecto) => proyecto.id === id) ?? await cargarProyectoDelDueno(id, user?.id);
  // Un proyecto que ya no está en el tablero no se indexa: manda gente a una
  // puerta cerrada.
  if (!detalle) return { robots: { index: false, follow: true } };
  const titulo = String(detalle.title ?? "").trim();
  const descripcion = String(detalle.description ?? "").replace(/\s+/gu, " ").trim();
  return metadatosDePantalla({
    locale,
    ruta: `/proyectos/${id}`,
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
  const [proyectos, mios] = await Promise.all([cargarProyectosPublicos(), idsDeMisProyectos(supabase, user?.id)]);
  // El tablero solo trae los abiertos. Si el proyecto ya se finalizó o se
  // canceló, su DUEÑO tiene que poder abrirlo igual —es suyo, y desde el panel
  // hay un enlace directo—: antes eso daba «página no encontrada».
  const detalle = proyectos.find((proyecto) => proyecto.id === id)
    ?? await cargarProyectoDelDueno(id, user?.id);
  if (!detalle) notFound();
  return <ProjectsBoard proyectos={proyectos} currentUserId={user?.id ?? null} detalle={detalle} misProyectos={mios} volverA={from} />;
}
