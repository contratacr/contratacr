import type { InitialAvailability } from "@/hooks/use-profesional-con-app";
import type { ProfessionalOffer } from "@/lib/offers";
import { jobMatchesSearch, type JobPost } from "@/lib/jobs";
import type { ProyectoPublico } from "@/lib/proyectos";

export const MARKETPLACE_PAGE_SIZE = 20;
export type FeedSection = "proyectos" | "promociones" | "empleos";
export type FeedItem = ProyectoPublico | ProfessionalOffer | JobPost;
export type FeedFilters = { q?: string; location?: string; published?: string; tipo?: string; workplace?: string; experience?: string; employment?: string };
export type FeedPage<T> = {
  items: T[]; total: number; catalogTotal: number; nextCursor: string | null; asOf: string;
  contactAvailability?: InitialAvailability;
  filters: FeedFilters; suggestions: string[]; locations: string[]; selected?: T;
};
export function feedKey(filters: FeedFilters) {
  return JSON.stringify(Object.entries(filters).filter(([,v])=>v && v!=="all").map(([k,v])=>[k,v!.trim().toLocaleLowerCase('es-CR')]).filter(([,v])=>v).sort(([a],[b])=>a.localeCompare(b)));
}
export function feedMatches(section: FeedSection, item: FeedItem, filters: FeedFilters, now: number) {
  const q=filters.q?.trim()??""; const location=(filters.location??"").trim().toLocaleLowerCase("es-CR");
  if(filters.published && filters.published!=="all" && now-Date.parse(item.created_at)>Number(filters.published)*86400000)return false;
  if(location && !(section==="empleos" && (item as JobPost).workplace_type==="remote") && !item.location_label?.toLocaleLowerCase("es-CR").includes(location))return false;
  if(section==="proyectos") {
    const p=item as ProyectoPublico;
    return !q || `${p.title} ${p.description} ${p.category_name??""} ${p.location_label??""}`.toLocaleLowerCase("es-CR").includes(q.toLocaleLowerCase("es-CR"));
  }
  if(section==="promociones") {
    const p=item as ProfessionalOffer;
    return (!filters.tipo||filters.tipo==="all"||p.offer_type===filters.tipo) && (!q||[p.title,p.description,p.service_label,p.location_label,p.professional_name].some(v=>v?.toLocaleLowerCase("es-CR").includes(q.toLocaleLowerCase("es-CR"))));
  }
  const j=item as JobPost;
  return jobMatchesSearch(q,[j.title,j.employer_name,j.location_label,j.description,...(j.requirements??[]),...(j.responsibilities??[])])
    && (!filters.workplace||filters.workplace==="all"||j.workplace_type===filters.workplace)
    && (!filters.employment||filters.employment==="all"||j.employment_type===filters.employment)
    && (!filters.experience||filters.experience==="all"||(j.experience_level??"any")===filters.experience);
}
export function paginateFeed<T extends FeedItem>(items:T[],section:FeedSection,filters:FeedFilters,asOf:string,cursor?:string|null,selectedId?:string|null):FeedPage<T> {
  const now=Date.parse(asOf);
  const catalogue=items.filter(i=>Date.parse(i.created_at)<=now).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||(a.id<b.id?1:a.id>b.id?-1:0));
  const matching=catalogue.filter(i=>feedMatches(section,i,filters,now));
  const [afterDate,afterId]=cursor?.split("|")??[];
  if(cursor && (!afterId||!Number.isFinite(Date.parse(afterDate))))throw new Error("invalid-feed-cursor");
  const remaining=cursor?matching.filter(i=>Date.parse(i.created_at)<Date.parse(afterDate)||(Date.parse(i.created_at)===Date.parse(afterDate)&&i.id<afterId)):matching;
  const page=remaining.slice(0,MARKETPLACE_PAGE_SIZE); const last=page.at(-1);
  const selected=selectedId?matching.find(i=>i.id===selectedId):undefined;
  return {items:page,total:matching.length,catalogTotal:catalogue.length,nextCursor:remaining.length>MARKETPLACE_PAGE_SIZE&&last?`${last.created_at}|${last.id}`:null,asOf,filters,
    suggestions:[...new Set(catalogue.map(i=>section==="proyectos"?(i as ProyectoPublico).category_name:i.title).filter((v):v is string=>!!v))].slice(0,50),
    locations:[...new Set(catalogue.map(i=>i.location_label).filter((v):v is string=>!!v))].slice(0,50),...(selected?{selected}:{}),};
}
