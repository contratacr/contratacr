import type {Metadata} from 'next';
import {cn} from '@/lib/utils';
import {notFound} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {PlacePage} from '@/components/directory/place-page';
import {PlaceClaimLink} from '@/components/directory/place-claim-link';
import {PlaceBranches,nearestBranches} from '@/components/directory/place-branches';
import {PlacePrices} from '@/components/directory/place-prices';
import {PlaceReviews} from '@/components/directory/place-reviews';
import {PlaceListingsSection} from '@/components/directory/place-listings-section';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {DIRECTORY_LISTINGS_ENABLED,DIR_HEALTH_ENABLED,DIR_ENABLED,placeIndexable} from '@/lib/directory/feature-flags';
import {placeJsonLd} from '@/lib/directory/place-jsonld';
import {DatosEstructurados} from '@/components/seo/datos-estructurados';
import {mapPublicListing,type PublicListing} from '@/lib/directory/listing-public';
import type {PublicPlace} from '@/lib/directory/types';
import type {PublicPriceCurrent} from '@/lib/directory/price-schemas';
import type {PublicPlaceReviews,ReplyTarget} from '@/lib/directory/review-schemas';
import {cookies} from 'next/headers';
import {PlacePriceReport} from '@/components/directory/place-price-report';
import {PRICE_REPORT_KINDS} from '@/lib/directory/moderation-schemas';
import {PRO_WS_COOKIE} from '@/lib/pro/workspace-gate';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {crTodayISO} from '@/lib/time-cr';
import type {PublicMenu} from '@/lib/directory/menu-schemas';
import {isServiceReviewVertical,RESERVATION_VERTICALS} from '@/lib/directory/place-verticals';
import {PlaceReservation} from '@/components/directory/place-reservation';
import {PlaceQuestions} from '@/components/directory/place-questions';
import {PlaceEvents} from '@/components/directory/place-events';
import {SaveToList} from '@/components/directory/save-to-list';
import {PlacePhotoUpload} from '@/components/directory/place-photo-upload';
import {businessPlaces} from '@/lib/directory/business-access';
import type {OrderLink,PlaceBrand,PlaceEvent,PublicBrand,PublicQuestions,ReservationConfig} from '@/lib/directory/place-features';
import {BIZ} from '@/components/directory/biz-ui';

// LOCAL PRO ONLY (multivertical F1–F5/P1/P2/V4, development only like /sitio): canonical page of a place, /lugar/<slug>.
// Only published (or permanently closed) places; every pharmacy since the owner decision of 2026-11-17 (its permit
// status is shown on the page; the per-vertical requires_license gate stays in SQL).
// Extra blocks: claim (while unclaimed), prices (public_price_current: source, date, stale greyed; never Rx),
// menu link (restaurants with a published menu), public listings of a dealer/agency, reviews. Hours source (OSM note).
// 2026-11-17 sections: cafés/bakeries/bars keep the menu (cafe_bar); banks/ATMs are map points (no reviews, prices or
// price reports; the claim only keeps the listing up to date); health/vet places show the review-scope note.
// Place features round (2026-11-17): banks accept service reviews again (same scope note as health); reservations +
// waitlist (claimed restaurants/cafés that opted in), Q&A on every page, upcoming events, «Pedir» link-out, brand link,
// «Guardar» in a list; the claim box benefits follow the section (place-verticals.ts claimBenefits).
export const dynamic='force-dynamic';
// M1 (moderation round): user price report form (pharmacies and supermarkets; restaurants use the menu); reply editor for the business
// under each review (its managers, or an admin/manager of its Pro team working in the owner's company) and «report
// review» for everyone else.
async function replyTargets(db:ReturnType<typeof createAdminClient>,userId:string,slug:string):Promise<ReplyTarget[]|null>{
 const own=await db.rpc('dir_review_reply_targets',{p_actor:userId,p_slug:slug});
 if(!own.error&&own.data)return own.data as ReplyTarget[];
 // The Pro team path (a member of the owner's Pro workspace) exists only while Pro is on (PRO_ENABLED).
 if(!PRO_ENABLED)return null;
 const owner=(await cookies()).get(PRO_WS_COOKIE)?.value;
 if(!owner||!/^[0-9a-f-]{36}$/i.test(owner)||owner===userId)return null;
 const role=await db.rpc('pro_role_of',{p_actor:userId,p_owner:owner});
 if(role.error||!role.data)return null;
 const allowed=await db.rpc('pro_role_allows',{p_role:role.data,p_capability:'listing.publish'});
 if(allowed.error||allowed.data!==true)return null;
 const team=await db.rpc('dir_review_reply_targets',{p_actor:owner,p_slug:slug});
 return team.error?null:team.data as ReplyTarget[]|null;
}
/** 5→1 distribution of the published reviews (index 0 = 1 star): five head-only counts, half stars rounded up from .5. */
async function reviewDistribution(db:ReturnType<typeof createAdminClient>,placeId:string):Promise<number[]|null>{
 const bands:[number,number][]=[[0,1.5],[1.5,2.5],[2.5,3.5],[3.5,4.5],[4.5,6]];
 const counts=await Promise.all(bands.map(([lo,hi])=>db.from('dir_reviews').select('id',{count:'exact',head:true}).eq('place_id',placeId).eq('moderation_status','published').gte('rating',lo).lt('rating',hi)));
 return counts.some(c=>c.error)?null:counts.map(c=>c.count??0);
}
async function load(slug:string){
 if(!placeSlugSchema.safeParse(slug).success)return null;
 const result=await createAdminClient().rpc('dir_place_public',{p_slug:slug});
 if(result.error||!result.data)return null;
 const place=result.data as PublicPlace;
 // Launch flag: a health place does not exist publicly while the section is off.
 return !DIR_HEALTH_ENABLED&&place.vertical?.id==='health'?null:place;
}
export async function generateMetadata({params}:{params:Promise<{locale:string;slug:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale,slug}=await params,place=await load(slug),en=locale==='en';
 if(!place)return {title:en?'Place not available':'Lugar no disponible',robots:{index:false,follow:false}};
 const path='/lugar/'+slug,area=[place.address.locality,place.address.adminArea1].filter(Boolean).join(', ');
 const vertical=en?place.vertical.nameEn:place.vertical.nameEs,description=`${vertical}${area?' · '+area:''}`;
 // Indexing rule (feature-flags.ts placeIndexable, DIR_INDEX_IMPORTED): claimed/verified places are indexed; imported
 // unclaimed ones only with a phone, opening hours or a website. Permanently closed places stay out of the index.
 const index=place.status==='published'&&placeIndexable({verificationLevel:place.verificationLevel,hasPhone:!!place.phone,hasHours:place.hours.length>0,hasWebsite:!!place.website});
 return {title:place.name,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},
  openGraph:{title:place.name,description,type:'website'},robots:{index,follow:index}};
}
export default async function PlaceRoute({params}:{params:Promise<{locale:string;slug:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale,slug}=await params,place=await load(slug);if(!place)notFound();
 const en=locale==='en',prefix=en?'/en':'',db=createAdminClient(),vertical=place.vertical.id;
 // Classified listings are OFF by owner decision: dealers/agencies show as places only (no listings block).
 const listingView=!DIRECTORY_LISTINGS_ENABLED?null:vertical==='vehicle_dealer'?'public_vehicle_listings':vertical==='real_estate'?'public_property_listings':null;
 const [claim,prices,reviews,menu,listings,user,hoursSource,questions,events,order,brand,reservation]=await Promise.all([
  db.from('dir_places').select('id,claim_status').eq('slug',slug).maybeSingle(),
  db.rpc('public_price_current',{p_place_slug:slug,p_item_slug:null}),
  db.rpc('dir_place_reviews_public',{p_slug:slug,p_after:null}),
  vertical==='restaurant'||vertical==='cafe_bar'?db.rpc('dir_place_menu_public',{p_slug:slug}):Promise.resolve(null),
  listingView?db.from(listingView).select('*',{count:'exact'}).eq('place_slug',slug).order('published_at',{ascending:false}).order('code').limit(6):Promise.resolve(null),
  createClient().then(safeGetUser),
  place.hours.length?db.rpc('dir_place_hours_source',{p_slug:slug}):Promise.resolve(null),
  db.rpc('dir_place_questions_public',{p_slug:slug}),
  db.rpc('dir_place_events_public',{p_slug:slug}),
  db.rpc('dir_order_link_public',{p_slug:slug}),
  db.rpc('dir_place_brand_public',{p_slug:slug}),
  (RESERVATION_VERTICALS as readonly string[]).includes(vertical)?db.rpc('dir_reservation_public_config',{p_slug:slug}):Promise.resolve(null),
 ]);
 const qa=questions.error?null:questions.data as PublicQuestions|null,upcoming=events.error?[]:(events.data as PlaceEvent[]|null)??[];
 const orderLink=order.error?null:order.data as OrderLink|null,placeBrand=brand.error?null:brand.data as PlaceBrand|null;
 const reservationConfig=reservation&&!reservation.error?reservation.data as ReservationConfig|null:null;
 const unclaimed=claim.data?.claim_status==='unclaimed'&&place.status==='published';
 // Claim (2026-11-19, Yelp model): a compact link in the side card; the flow and its benefits live in /lugar/<slug>/reclamar.
 const menuData=menu&&!menu.error?menu.data as PublicMenu|null:null;
 const placeListings=(listings?.data??[]).map(r=>mapPublicListing(r as Record<string,unknown>)).filter((l):l is PublicListing=>!!l);
 const loginHref=user?null:`${prefix}/login?redirect=${encodeURIComponent(`${prefix}/lugar/${slug}`)}`;
 const manage=user?await replyTargets(db,user.id,slug):null;
 const reportPrices=place.status==='published'&&vertical in PRICE_REPORT_KINDS;
 // Managers (or their Pro team with listing.publish, see replyTargets) answer questions as the business instead of asking.
 // The review reply editor posts to /api/pro/review-replies, so it is offered only while Pro is on.
 const isManager=!!manage;
 // «Mi negocio» (free, outside Pro): only the owner/managers of THIS claimed place see the shortcut (not Pro team members).
 const managesHere=!!user&&(await businessPlaces(db,user.id)).some(p=>p.slug===slug);
 const appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://contratacr.com').replace(/\/$/,'');
 const reviewData=reviews.data&&!reviews.error?reviews.data as PublicPlaceReviews:null;
 // Rating summary (Yelp model): counts per star, only when there are reviews; brand branches for «Otras sucursales».
 const [distribution,brandFull]=await Promise.all([
  reviewData&&reviewData.summary.count>0&&claim.data?.id?reviewDistribution(db,claim.data.id as string):Promise.resolve(null),
  placeBrand&&placeBrand.branches>1?db.rpc('dir_brand_public',{p_slug:placeBrand.slug}):Promise.resolve(null),
 ]);
 const branches=brandFull&&!brandFull.error&&brandFull.data&&!('mergedInto' in (brandFull.data as object))?nearestBranches((brandFull.data as PublicBrand).branches,slug,place.location,4):[];
 const reviewNote=!isServiceReviewVertical(vertical)?undefined:vertical==='banking'
  ?(en?'Reviews may only describe attention and service (punctuality, treatment, cleanliness, waiting time). They are not about rates, fees, financial products or credit decisions, and ContrataCR gives no financial advice.'
   :'Las reseñas solo pueden describir la atención y el servicio (puntualidad, trato, limpieza, tiempo de espera). No tratan sobre tasas, comisiones, productos financieros ni decisiones de crédito, y ContrataCR no da asesoría financiera.')
  :(en?'Reviews may only describe attention and service (punctuality, treatment, cleanliness, waiting time). They are not about diagnoses, treatments or results, and ContrataCR gives no medical advice.'
   :'Las reseñas solo pueden describir la atención y el servicio (puntualidad, trato, limpieza, tiempo de espera). No tratan sobre diagnósticos, tratamientos ni resultados, y ContrataCR no da consejo médico.');
 const published=place.status==='published';
 const hasOffer=!!(menuData&&menuData.sections.length>0)||!!(prices.data&&!prices.error)||reportPrices||placeListings.length>0;
 return <DirectoryShell>{published&&<DatosEstructurados datos={placeJsonLd(place,`${appUrl}${prefix}/lugar/${slug}`)}/>}<PlacePage place={place} locale={locale} hoursSource={hoursSource&&!hoursSource.error?hoursSource.data as string|null:null}
  orderLink={orderLink} brand={placeBrand}
  photoSlot={published?<PlacePhotoUpload slug={slug} locale={locale} signedIn={!!user} loginHref={loginHref} isManager={!!manage} popover buttonClass={BIZ.secondary}/>:null}
  saveSlot={published?<SaveToList slug={slug} locale={locale} signedIn={!!user} loginHref={loginHref}/>:null}
  slots={{
   top:(managesHere||reservationConfig)?<>
    {managesHere&&<div data-place-manage className="flex flex-col gap-3 rounded-2xl border border-[#d7e1ea] bg-[#F7FAFC] p-4 text-[#162543] sm:flex-row sm:items-center sm:justify-between">
     <p className="text-sm">{en?'You manage this page. Update contact details, hours, menu, reservations and events for free.':'Usted administra esta ficha. Actualice gratis el contacto, el horario, el menú, las reservas y los eventos.'}</p>
     <a data-place-manage-link href={`${prefix}/dashboard/negocio`} className={cn(BIZ.primary,'shrink-0 text-sm')}>{en?'Manage this page':'Administrar esta ficha'}</a>
    </div>}
    {reservationConfig&&<PlaceReservation slug={slug} locale={locale} config={reservationConfig}/>}
   </>:null,
   offer:hasOffer?<>
    {menuData&&menuData.sections.length>0&&<section aria-labelledby="place-menu-title" className="space-y-3">
     <h2 id="place-menu-title" className={BIZ.h2}>{en?'Menu':'Menú'}</h2>
     <p><a data-place-menu-link className={BIZ.secondary} href={`${prefix}/lugar/${slug}/menu`}>{en?'See the menu':'Ver el menú'}</a></p></section>}
    {prices.data&&!prices.error&&<PlacePrices prices={prices.data as PublicPriceCurrent} locale={locale}/>}
    {reportPrices&&<PlacePriceReport slug={slug} locale={locale} loginHref={loginHref} today={crTodayISO()}/>}
    {placeListings.length>0&&<PlaceListingsSection listings={placeListings} locale={locale} total={listings?.count??undefined}/>}
   </>:null,
   events:upcoming.length?<PlaceEvents events={upcoming} locale={locale}/>:null,
   questions:qa?<PlaceQuestions slug={slug} locale={locale} initial={qa} signedIn={!!user} loginHref={loginHref} isManager={isManager}/>:null,
   reviews:reviewData?<PlaceReviews slug={slug} locale={locale} initial={reviewData} signedIn={!!user} manage={manage} note={reviewNote} distribution={distribution}/>:null,
   claim:unclaimed?<PlaceClaimLink slug={slug} locale={locale}/>:null,
   branches:branches.length&&placeBrand?<PlaceBranches brand={placeBrand} branches={branches} locale={locale}/>:null,
  }}/></DirectoryShell>;
}
