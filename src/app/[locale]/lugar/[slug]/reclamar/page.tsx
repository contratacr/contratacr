import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {ChevronLeft} from 'lucide-react';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {PlaceClaim} from '@/components/directory/place-claim';
import {HeroTile,ring} from '@/components/directory/biz-ui';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {DIR_CLAIM_SMS_ENABLED,DIR_HEALTH_ENABLED,DIR_ENABLED} from '@/lib/directory/feature-flags';
import type {ClaimOptions} from '@/lib/directory/claim-schemas';
import type {PublicPlace} from '@/lib/directory/types';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// /lugar/<slug>/reclamar (2026-11-19, Yelp model): the claim flow on its own page, with the section's benefits
// (place-verticals.ts claimBenefits). The place page keeps only a compact «¿Es su negocio? Reclámelo gratis» link.
// Choices and rules are those of PlaceClaim (e-mail on the place, website-domain e-mail, staff review; SMS behind its
// flags). A place that is not published or already has a manager goes back to its page. Never indexed.
export const dynamic='force-dynamic';
async function load(slug:string){
 if(!placeSlugSchema.safeParse(slug).success)return null;
 const result=await createAdminClient().rpc('dir_place_public',{p_slug:slug});
 if(result.error||!result.data)return null;
 const place=result.data as PublicPlace;
 return !DIR_HEALTH_ENABLED&&place.vertical?.id==='health'?null:place;
}
export async function generateMetadata({params}:{params:Promise<{locale:string;slug:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale,slug}=await params,place=await load(slug),en=locale==='en';
 return {title:place?(en?`Claim ${place.name}`:`Reclamar ${place.name}`):(en?'Place not available':'Lugar no disponible'),robots:{index:false,follow:false}};
}
export default async function PlaceClaimRoute({params}:{params:Promise<{locale:string;slug:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale,slug}=await params,place=await load(slug);if(!place)notFound();
 const en=locale==='en',prefix=en?'/en':'',db=createAdminClient(),t=(es:string,english:string)=>en?english:es;
 const back=`${prefix}/lugar/${slug}`;
 const [claim,user]=await Promise.all([db.from('dir_places').select('claim_status').eq('slug',slug).maybeSingle(),createClient().then(safeGetUser)]);
 if(place.status!=='published'||claim.data?.claim_status!=='unclaimed')redirect(back);
 const options=await db.rpc('dir_claim_options',{p_slug:slug});
 const o=!options.error&&options.data?options.data as ClaimOptions:null;
 const choices={emailListed:o?.emailListed??null,websiteHost:o?.websiteHost??null,sms:DIR_CLAIM_SMS_ENABLED&&!!o?.smsEnabled&&!!o?.phoneListed};
 const loginHref=user?null:`${prefix}/login?redirect=${encodeURIComponent(`${prefix}/lugar/${slug}/reclamar`)}`;
 const area=[place.address.locality??place.address.adminArea2,place.address.adminArea1].filter(Boolean).join(', ');
 return <DirectoryShell><main id="contenido" data-place-claim-page={slug} className="mx-auto max-w-2xl space-y-6 px-4 py-8 text-[#162543] sm:py-12">
  <a href={back} className={`inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#007fae] hover:underline ${ring}`}><ChevronLeft aria-hidden="true" className="h-4 w-4"/>{t('Volver a la ficha','Back to the listing')}</a>
  <header className="flex items-center gap-4">
   <HeroTile verticalId={place.vertical.id} className="h-16 w-16 shrink-0 rounded-2xl" iconClass="h-7 w-7"/>
   <div className="min-w-0"><h1 className="break-words text-[28px] font-extrabold leading-tight sm:text-[32px]">{t(`Reclamar "${place.name}"`,`Claim "${place.name}"`)}</h1>
    {area&&<p className="text-[15px] text-[#526277]">{area}</p>}</div>
  </header>
  <PlaceClaim slug={slug} locale={locale} loginHref={loginHref} choices={choices} vertical={place.vertical.id} proEnabled={PRO_ENABLED}/>
 </main></DirectoryShell>;
}
