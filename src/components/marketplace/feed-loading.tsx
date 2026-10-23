"use client";
import type { ReactNode } from "react";
import { ContactAvailabilityProvider, ResolvedContactAvailabilityProvider, useProfesionalConApp, type InitialAvailability } from "@/hooks/use-profesional-con-app";
import { useLocale } from "next-intl";
import { Skeleton } from "@/components/ui/content-loading";
export function MarketplaceRowSkeleton(){
  return <div aria-hidden className="flex gap-2.5 border-b border-[#e5e7eb] bg-white px-3 py-3 sm:gap-3 sm:px-4"><Skeleton immediate className="h-11 w-11 shrink-0 rounded-full sm:h-12 sm:w-12"/><div className="min-w-0 flex-1 space-y-2"><Skeleton immediate className="h-5 w-4/5 rounded"/><Skeleton immediate className="h-4 w-3/5 rounded"/><Skeleton immediate className="h-4 w-1/2 rounded"/><Skeleton immediate className="h-3 w-1/3 rounded"/></div></div>;
}
export function MarketplaceFeedFeedback({feed:{enabled,loading,showSkeleton,error,sentinel,retry,hasMore}}:{feed:{enabled:boolean;loading:boolean;showSkeleton:boolean;error:boolean;hasMore:boolean;sentinel:(node:HTMLDivElement|null)=>void;retry:()=>void}}){
  const en=useLocale()==="en";
  if(!enabled)return null;
  return <div ref={sentinel} data-marketplace-sentinel data-marketplace-has-more={hasMore?"":undefined} className="min-h-px">
    {loading&&showSkeleton&&<div role="status" aria-busy="true" aria-label={en?"Loading more results":"Cargando más resultados"} data-marketplace-skeleton><MarketplaceRowSkeleton/><MarketplaceRowSkeleton/></div>}
    {error&&<div className="bg-white px-4 py-6 text-center"><p className="text-sm text-[#68778d]">{en?"We could not load the results.":"No pudimos cargar los resultados."}</p><button type="button" onClick={retry} className="mt-3 rounded-full border border-[#b9d9e8] px-5 py-2 text-sm font-bold text-[#007fae]">{en?"Try again":"Reintentar"}</button></div>}
  </div>;
}

/** A desktop preview shares the resolved channel with its CTA; it never reveals
 * a second button-level loader after the list row has arrived. */
export function MarketplaceContactBoundary({enabled,snapshot,professionalId,children}:{enabled:boolean;snapshot?:InitialAvailability;professionalId:string;children:ReactNode}){
  if(!enabled)return children;
  return <ContactAvailabilityProvider {...(snapshot??{viewerId:"",values:{},resolvedAt:0})}><ResolvedPreview professionalId={professionalId}>{children}</ResolvedPreview></ContactAvailabilityProvider>;
}
function ResolvedPreview({professionalId,children}:{professionalId:string;children:ReactNode}){
  const channel=useProfesionalConApp(professionalId,true);const en=useLocale()==="en";
  if(channel===null)return <div className="hidden bg-white p-7 lg:block" role="status" aria-busy="true" aria-label={en?"Loading publication":"Cargando publicación"}><Skeleton immediate className="mb-6 h-56 w-full rounded-xl"/><MarketplaceRowSkeleton/><Skeleton immediate className="mt-5 h-11 w-full rounded-full"/><Skeleton immediate className="mt-2 h-11 w-full rounded-full"/></div>;
  return <ResolvedContactAvailabilityProvider professionalId={professionalId} value={channel}>{children}</ResolvedContactAvailabilityProvider>;
}
