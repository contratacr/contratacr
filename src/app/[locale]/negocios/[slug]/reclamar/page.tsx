import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {ChevronLeft,MapPin} from 'lucide-react';
import {cn} from '@/lib/utils';
import {ProfileIdentityName} from '@/components/professionals/profile-identity-name';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {PlaceClaim} from '@/components/directory/place-claim';
import {BIZ,HeroTile,ring} from '@/components/directory/biz-ui';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {DIR_CLAIM_SMS_ENABLED,DIR_HEALTH_ENABLED,DIR_ENABLED} from '@/lib/directory/feature-flags';
import type {ClaimOptions} from '@/lib/directory/claim-schemas';
import type {PublicPlace} from '@/lib/directory/types';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// /negocios/<slug>/reclamar (2026-11-19, Yelp model): the claim flow on its own page, with the section's benefits
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
 const back=`${prefix}/negocios/${slug}`;
 const [claim,user]=await Promise.all([db.from('dir_places').select('claim_status').eq('slug',slug).maybeSingle(),createClient().then(safeGetUser)]);
 if(place.status!=='published'||claim.data?.claim_status!=='unclaimed')redirect(back);
 const options=await db.rpc('dir_claim_options',{p_slug:slug});
 const o=!options.error&&options.data?options.data as ClaimOptions:null;
 const choices={emailListed:o?.emailListed??null,websiteHost:o?.websiteHost??null,sms:DIR_CLAIM_SMS_ENABLED&&!!o?.smsEnabled&&!!o?.phoneListed};
 const loginHref=user?null:`${prefix}/login?redirect=${encodeURIComponent(`${prefix}/negocios/${slug}/reclamar`)}`;
 const area=[place.address.locality??place.address.adminArea2,place.address.adminArea1].filter(Boolean).join(', ');
 return <DirectoryShell><main id="contenido" data-place-claim-page={slug} className="mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-4 text-[#162543] sm:px-6 lg:pt-8">
  <a href={back} className={`inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#007fae] hover:underline ${ring}`}><ChevronLeft aria-hidden="true" className="h-4 w-4"/>{t('Volver a la ficha','Back to the listing')}</a>
  <header className={cn(BIZ.card,'flex items-center gap-3 p-4 sm:gap-5 sm:p-6')}>
   <span className={cn(BIZ.avatar,'relative grid shrink-0 place-items-center overflow-hidden rounded-full')}><HeroTile verticalId={place.vertical.id} className="h-full w-full" iconClass="h-8 w-8 sm:h-10 sm:w-10"/></span>
   <div className="min-w-0 flex-1"><ProfileIdentityName name={t(`Reclamar "${place.name}"`,`Claim "${place.name}"`)}/>
    {area&&<p className="mt-1.5 flex items-center gap-1 text-[12.5px] text-[#68778d]"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>{area}</p>}</div>
  </header>
  <PlaceClaim slug={slug} locale={locale} loginHref={loginHref} choices={choices} vertical={place.vertical.id} proEnabled={PRO_ENABLED}/>
 </main></DirectoryShell>;
}
