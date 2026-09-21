import { notFound } from "next/navigation";
import { ProjectsBoard } from "@/components/projects/projects-board";
import { cargarProyectoDelDueno, cargarProyectosPublicos } from "@/lib/queries/proyectos-publicos";
import { safeGetUser } from "@/lib/supabase/get-user";
import { idsDeMisProyectos } from "@/lib/queries/proyectos-publicos";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProyectoDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ from?: string }> }) {
  const { id } = await params;
  // Igual que en Empleos y Promociones: el enlace de volver solo se dibuja
  // cuando se llegó DE FUERA —por Google o por un enlace de WhatsApp—, porque
  // ahí la flecha del navegador saca del sitio. Viniendo del tablero o del
  // panel esa flecha ya hace exactamente eso.
  const llegoDeFuera = !(await searchParams)?.from;
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
  return <ProjectsBoard proyectos={proyectos} currentUserId={user?.id ?? null} detalle={detalle} misProyectos={mios} llegoDeFuera={llegoDeFuera} />;
}
