import { ProjectsBoard } from "@/components/projects/projects-board";
import { marketplacePage } from "@/lib/marketplace/feed-server";
import type { FeedPage } from "@/lib/marketplace/feed";
import type { ProyectoPublico } from "@/lib/proyectos";
import { getLocale } from "next-intl/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { idsDeMisProyectos } from "@/lib/queries/proyectos-publicos";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProyectosPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const params=await searchParams;const locale=await getLocale();
  if (!hasSupabaseServerConfig()) return <ProjectsBoard proyectos={[]} currentUserId={null} />;
  let props:{proyectos:ProyectoPublico[];initialFeed?:FeedPage<ProyectoPublico>;currentUserId:string|null;misProyectos:string[]}={proyectos:[],currentUserId:null,misProyectos:[]};
  try {
    const supabase = await createClient();
    const user = await safeGetUser(supabase);
    const [feed,mios]=await Promise.all([marketplacePage("proyectos",{q:params.q,location:params.location},user?.id,locale),idsDeMisProyectos(supabase,user?.id)]);
    props={proyectos:feed.items as ProyectoPublico[],initialFeed:feed as FeedPage<ProyectoPublico>,currentUserId:user?.id??null,misProyectos:mios};
  } catch (error) {
    console.error("Could not initialize projects board", error);
  }
  return <ProjectsBoard {...props}/>;
}
