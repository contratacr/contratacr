import { notFound } from "next/navigation";
import { ProjectsBoard } from "@/components/projects/projects-board";
import { cargarProyectosPublicos } from "@/lib/queries/proyectos-publicos";
import { safeGetUser } from "@/lib/supabase/get-user";
import { idsDeMisProyectos } from "@/lib/queries/proyectos-publicos";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProyectoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseServerConfig()) notFound();
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const [proyectos, mios] = await Promise.all([cargarProyectosPublicos(), idsDeMisProyectos(supabase, user?.id)]);
  const detalle = proyectos.find((proyecto) => proyecto.id === id);
  if (!detalle) notFound();
  return <ProjectsBoard proyectos={proyectos} currentUserId={user?.id ?? null} detalle={detalle} misProyectos={mios} />;
}
