import { marketplacePage } from "@/lib/marketplace/feed-server";
import type { FeedPage } from "@/lib/marketplace/feed";
import { getLocale } from "next-intl/server";
import { JobsBoard } from "@/components/jobs/jobs-board";
import { type JobPost } from "@/lib/jobs";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function JobsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  if (!hasSupabaseServerConfig()) {
    return (
      <JobsBoard
        jobs={[]}
        canPost={false}
        initialSelectedJobId={null}
        returnTo={null}
        currentProfessionalId={null}
        currentUserId={null}
        detailOnly={false}
      />
    );
  }

  let props:{jobs:JobPost[];initialFeed?:FeedPage<JobPost>;canPost:boolean;currentProfessionalId:string|null;currentUserId:string|null}={jobs:[],canPost:false,currentProfessionalId:null,currentUserId:null};
  try {
    const params=await searchParams;const locale=await getLocale();const db=await createClient();const user=await safeGetUser(db);
    const [feed,{data:professional}]=await Promise.all([
      marketplacePage("empleos",{q:params.q,location:params.location,published:params.published,workplace:params.workplace,experience:params.experience,employment:params.employment},user?.id,locale,{selectedId:params.job??params.apply}),
      user?db.from("professionals").select("id").eq("profile_id",user.id).maybeSingle():Promise.resolve({data:null}),
    ]);
    props={jobs:feed.items as JobPost[],initialFeed:feed as FeedPage<JobPost>,canPost:!!professional,currentProfessionalId:professional?.id??null,currentUserId:user?.id??null};
  } catch(error){console.error("Could not initialize jobs page",error);}
  return <JobsBoard {...props}/>;
}
