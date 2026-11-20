import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { enforceRateLimit } from "@/lib/rate-limit";
import { marketplacePage } from "@/lib/marketplace/feed-server";
import type { FeedFilters, FeedSection } from "@/lib/marketplace/feed";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const limited=enforceRateLimit(request,"marketplace-results",90,60000);if(limited)return limited;
  const params=new URL(request.url).searchParams;
  const section=params.get("section") as FeedSection;
  if(!["proyectos","promociones","empleos"].includes(section))return NextResponse.json({error:"Invalid section"},{status:400});
  const cursor=params.get("cursor");
  if(cursor&&(!cursor.includes("|")||!Number.isFinite(Date.parse(cursor.split("|")[0]))||!cursor.split("|")[1]||cursor.length>200))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const filters:FeedFilters={};for(const key of ["q","location","published","tipo","workplace","experience","employment"] as const){const value=params.get(key);if(value)filters[key]=value.slice(0,300);}
  try{
    const user=await safeGetUser(await createClient());
    const page=await marketplacePage(section,filters,user?.id,params.get("locale")==="en"?"en":"es",{cursor:params.get("cursor"),asOf:params.get("asOf"),selectedId:params.get("selected")});
    return NextResponse.json(page,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){console.error("[marketplace/results] failed",error);return NextResponse.json({error:"Could not load results"},{status:500});}
}
