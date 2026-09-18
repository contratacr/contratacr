import { ProjectsBoard } from "@/components/projects/projects-board";
import { cargarProyectosPublicos } from "@/lib/queries/proyectos-publicos";
import { safeGetUser } from "@/lib/supabase/get-user";
import { idsDeMisProyectos } from "@/lib/queries/proyectos-publicos";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  if (!hasSupabaseServerConfig()) return <ProjectsBoard proyectos={[]} currentUserId={null} />;
  try {
    const supabase = await createClient();
    const user = await safeGetUser(supabase);
    const [proyectos, mios] = await Promise.all([cargarProyectosPublicos(), idsDeMisProyectos(supabase, user?.id)]);
    return <ProjectsBoard proyectos={proyectos} currentUserId={user?.id ?? null} misProyectos={mios} />;
  } catch (error) {
    console.error("Could not initialize projects board", error);
    return <ProjectsBoard proyectos={[]} currentUserId={null} />;
  }
}
