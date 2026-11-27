import type {Metadata} from 'next';
import {DIRECTORY_LISTINGS_ENABLED,DIR_ENABLED} from '@/lib/directory/feature-flags';
import {notFound,permanentRedirect} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {codeFromSegment,formatMoney,listingPath,mapPublicListing,PROPERTY_TYPE_LABELS,type PublicPropertyListing} from '@/lib/directory/listing-public';
import {ListingClient} from '@/components/directory/listing-client';
import {DirectoryShell} from '@/components/directory/directory-shell';

// LOCAL PRO ONLY (R1, development only like /negocios): /inmuebles/i/<slug>-<code>. Public coordinates are always fuzzed by SQL.
async function load(segment:string){
 const code=codeFromSegment(segment);if(!code)return null;
 const result=await createAdminClient().rpc('dir_listing_public',{p_code:code});
 if(result.error||!result.data)return null;
 // Photos: the public photo reader (bucket dir-listing-photos is private) is still pending, so no URLs yet.
 const listing=mapPublicListing(result.data as Record<string,unknown>);
 return listing?.vertical==='inmuebles'?listing as PublicPropertyListing:null;
}
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string;slug:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED||!DIRECTORY_LISTINGS_ENABLED)return {};
 const {locale,slug}=await params,listing=await load(slug),en=locale==='en';
 if(!listing)return {title:en?'Listing not available':'Anuncio no disponible',robots:{index:false,follow:false}};
 const path=listingPath(listing,'es'),type=PROPERTY_TYPE_LABELS[listing.propertyType]?.[en?'en':'es']??'';
 const description=`${type} · ${listing.operation==='rent'?(en?'For rent':'Alquiler'):(en?'For sale':'Venta')} · ${formatMoney(listing.priceMinor,listing.currency,locale)}${listing.adminArea2?' · '+listing.adminArea2:''}`;
 return {title:listing.title,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},openGraph:{title:listing.title,description,type:'website'},
  robots:{index:listing.status==='published',follow:true}};
}
export default async function PropertyListingRoute({params}:{params:Promise<{locale:string;slug:string}>}){
 // Classified listings are OFF by owner decision (feature-flags.ts): 404 while the flag is off.
 if(!DIR_ENABLED||!DIRECTORY_LISTINGS_ENABLED)notFound();
 const {locale,slug}=await params,listing=await load(slug);if(!listing)notFound();
 const path=listingPath(listing,locale);if(!path.endsWith('/'+slug))permanentRedirect(path);
 return <DirectoryShell><ListingClient listing={listing} locale={locale} path={path} financing={null}/></DirectoryShell>;
}
