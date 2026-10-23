import { OffersBoard } from "@/components/offers/offers-board";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { marketplacePage } from "@/lib/marketplace/feed-server";
import type { FeedPage } from "@/lib/marketplace/feed";
import type { ProfessionalOffer } from "@/lib/offers";
export const dynamic="force-dynamic";
export default async function OffersPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const locale=await getLocale();const params=await searchParams;
  const serviceOptions=getAllCategories().map(category=>({value:category.id,label:getCategoryLabel(category.id,locale)}));
  let props:{offers:ProfessionalOffer[];initialFeed?:FeedPage<ProfessionalOffer>;canPost:boolean;currentProfessionalId:string|null;currentUserId:string|null}={offers:[],canPost:false,currentProfessionalId:null,currentUserId:null};
  if(hasSupabaseServerConfig())try{
    const db=await createClient();const user=await safeGetUser(db);
    const [feed,{data:professional}]=await Promise.all([
      marketplacePage("promociones",{q:params.q,location:params.location},user?.id,locale,{selectedId:params.offer}),
      user?db.from("professionals").select("id").eq("profile_id",user.id).maybeSingle():Promise.resolve({data:null}),
    ]);
    props={offers:feed.items as ProfessionalOffer[],initialFeed:feed as FeedPage<ProfessionalOffer>,canPost:!!professional,currentProfessionalId:professional?.id??null,currentUserId:user?.id??null};
  }catch(error){console.error("Could not initialize offers page",error);}
  return <OffersBoard {...props} serviceOptions={serviceOptions}/>;
}
