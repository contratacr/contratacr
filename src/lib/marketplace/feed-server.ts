import "server-only";
import { contactAvailability } from "@/lib/direct-chat/availability";
import { createAdminClient } from "@/lib/supabase/admin";
import { perfilesBloqueadosPor } from "@/lib/queries/bloqueos";
import { cargarProyectosPublicosConAutor } from "@/lib/queries/proyectos-publicos";
import { getProfessionalDisplayName } from "@/lib/display-name";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { contactFlagsFor } from "@/lib/contact-flags";
import { crTodayISO } from "@/lib/time-cr";
import { paginateFeed, type FeedFilters, type FeedItem, type FeedSection } from "./feed";
import type { ProfessionalOffer } from "@/lib/offers";
import type { JobPost } from "@/lib/jobs";
import type { ProyectoPublico } from "@/lib/proyectos";

const OFFER_COLUMNS="id,professional_id,service_category_id,title,description,offer_type,service_label,image_urls,price_now,price_before,currency,price_unit,location_label,valid_until,quantity_available,status,created_at,contact_whatsapp";
const JOB_COLUMNS="id,employer_id,service_category_id,duration_label,experience_level,title,description,responsibilities,requirements,benefits,employment_type,workplace_type,provincia_id,canton_id,location_label,salary_min,salary_max,salary_period,currency,show_salary,openings,application_deadline,status,created_at,contact_whatsapp";
type Owner={profile_id?:string;is_banned?:boolean;slug?:string;business_name?:string;verification_status?:string;profiles?:{full_name?:string;avatar_url?:string|null}|null};

/** Filtering covers the entire catalogue; only twenty public DTOs are serialized.
 * Reads use bounded DB ranges, with no historic 100-row ceiling. No persistent
 * cache: publishing/editing/deleting and account blocks are visible immediately.
 */
export async function marketplacePage(section:FeedSection,filters:FeedFilters,viewerId:string|undefined,locale:string,options:{cursor?:string|null;asOf?:string|null;selectedId?:string|null}={}) {
  const asOf=options.asOf&&Number.isFinite(Date.parse(options.asOf))&&Date.parse(options.asOf)<=Date.now()?options.asOf:new Date().toISOString();
  const blocked=await perfilesBloqueadosPor(viewerId);
  const items:FeedItem[]=[];const owners=new Map<string,string>();
  const db=createAdminClient();
  for(let offset=0;;offset+=200){
    if(section==="proyectos"){
      const batch=await cargarProyectosPublicosConAutor(200,locale,offset);
      for(const {client_id,...item} of batch)if(!blocked.has(client_id))items.push(item);
      if(batch.length<200)break;
    }else{
      const offers=section==="promociones";
      const columns: string=`${offers?OFFER_COLUMNS:JOB_COLUMNS},professionals!${offers?"professional_offers_professional_id_fkey":"job_posts_employer_id_fkey"}(profile_id,is_banned,slug,business_name,verification_status,profiles(full_name,avatar_url))`;
      let query=db.from(offers?"professional_offers":"job_posts").select(columns)
        .eq("status","published").order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+199);
      if(offers)query=query.or(`valid_until.is.null,valid_until.gte.${crTodayISO()}`);
      const {data,error}=await query;
      if(error)throw new Error(`marketplace-unavailable: ${error.code}`);
      const batch=(data??[]) as unknown as Array<Record<string,unknown>>;
      for(const row of batch){
        const owner=row.professionals as Owner|null;
        if(!owner||owner.is_banned||blocked.has(owner.profile_id??""))continue;
        owners.set(String(row[offers?"professional_id":"employer_id"]??""),owner.profile_id??"");
        const {professionals:_owner,contact_whatsapp:phone,...publicFields}=row;void _owner;
        const display=repairVisibleText(getProfessionalDisplayName(owner.profiles?.full_name??"",owner.business_name).primaryDesktop||(locale==="en"?"Professional on ContrataCR":"Profesional en ContrataCR"));
        const common={...publicFields,title:repairVisibleText(String(row.title??"")),description:repairVisibleText(String(row.description??"")),contact_whatsapp:viewerId&&owner.profile_id===viewerId?String(phone??""):undefined};
        if(offers)items.push({...common,image_urls:Array.isArray(row.image_urls)?row.image_urls:[],service_label:row.service_label?repairVisibleText(String(row.service_label)):null,location_label:row.location_label?repairVisibleText(String(row.location_label)):null,
          professional_name:display,professional_slug:owner.slug??null,professional_avatar_url:owner.profiles?.avatar_url??null,professional_verified:owner.verification_status==="verified",professional_has_whatsapp:!!String(phone??"").trim()} as ProfessionalOffer);
        else {const job={...common,employer_name:display,employer_slug:owner.slug??null,employer_avatar_url:owner.profiles?.avatar_url??null,employer_verified:owner.verification_status==="verified",employer_has_whatsapp:!!String(phone??"").trim()} as JobPost;
          if(!job.show_salary&&owner.profile_id!==viewerId){job.salary_min=null;job.salary_max=null;}
          items.push(job);
        }
      }
      if(batch.length<200)break;
    }
  }
  const page=paginateFeed(items,section,filters,asOf,options.cursor,options.selectedId);
  if(section!=="proyectos"){
    const visible=[...page.items,...(page.selected?[page.selected]:[])];
    const ids=visible.map(i=>section==="promociones"?(i as ProfessionalOffer).professional_id:(i as JobPost).employer_id);
    const [flags,values]=await Promise.all([contactFlagsFor(ids),viewerId?contactAvailability(viewerId,[...new Set(ids)].map(id=>({id,profileId:owners.get(id)}))):Promise.resolve({})]);
    page.contactAvailability={viewerId:viewerId??"",values,resolvedAt:Date.now()};
    for(const item of visible){
      if(section==="promociones"){const p=item as ProfessionalOffer;p.professional_has_whatsapp ||= flags[p.professional_id]?.hasWhatsapp??false;p.professional_allow_phone_call=flags[p.professional_id]?.allowPhoneCall??false;}
      else {const j=item as JobPost;j.employer_has_whatsapp ||= flags[j.employer_id]?.hasWhatsapp??false;j.employer_allow_phone_call=flags[j.employer_id]?.allowPhoneCall??false;}
    }
  }
  return page;
}
export type {ProfessionalOffer,JobPost,ProyectoPublico};
