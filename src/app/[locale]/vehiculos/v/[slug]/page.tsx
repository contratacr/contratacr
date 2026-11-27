import type {Metadata} from 'next';
import {DIRECTORY_LISTINGS_ENABLED,DIR_ENABLED} from '@/lib/directory/feature-flags';
import {notFound,permanentRedirect} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {codeFromSegment,mapDeclaredFinancing,formatMoney,listingPath,mapPublicListing,type PublicVehicleListing} from '@/lib/directory/listing-public';
import {ListingClient} from '@/components/directory/listing-client';
import {DirectoryShell} from '@/components/directory/directory-shell';

// LOCAL PRO ONLY (V4, development only like /negocios): /vehiculos/v/<slug>-<code>. The code is authoritative; a stale
// slug redirects to the canonical one. dir_listing_public only returns public data (no ids, plate, VIN, exact point).
async function load(segment:string){
 const code=codeFromSegment(segment);if(!code)return null;
 const result=await createAdminClient().rpc('dir_listing_public',{p_code:code});
 if(result.error||!result.data)return null;
 // Photos: the public photo reader (bucket dir-listing-photos is private) is still pending, so no URLs yet.
 const listing=mapPublicListing(result.data as Record<string,unknown>);
 return listing?.vertical==='vehiculos'?{listing:listing as PublicVehicleListing,financing:mapDeclaredFinancing((result.data as Record<string,unknown>).financing)}:null;
}
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string;slug:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED||!DIRECTORY_LISTINGS_ENABLED)return {};
 const {locale,slug}=await params,listing=(await load(slug))?.listing,en=locale==='en';
 if(!listing)return {title:en?'Listing not available':'Anuncio no disponible',robots:{index:false,follow:false}};
 const path=listingPath(listing,'es'),description=`${listing.makeName} ${listing.modelName} ${listing.year} · ${formatMoney(listing.priceMinor,listing.currency,locale)}${listing.adminArea1?' · '+listing.adminArea1:''}`;
 return {title:listing.title,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},openGraph:{title:listing.title,description,type:'website'},
  robots:{index:listing.status==='published',follow:true}};
}
export default async function VehicleListingRoute({params}:{params:Promise<{locale:string;slug:string}>}){
 // Classified listings are OFF by owner decision (feature-flags.ts): 404 while the flag is off.
 if(!DIR_ENABLED||!DIRECTORY_LISTINGS_ENABLED)notFound();
 const {locale,slug}=await params,loaded=await load(slug);if(!loaded)notFound();
 const path=listingPath(loaded.listing,locale);if(!path.endsWith('/'+slug))permanentRedirect(path);
 // Financing declared by the dealer (dir_listing_public.financing, < 180 days); always shown with the fixed notice.
 return <DirectoryShell><ListingClient listing={loaded.listing} locale={locale} path={path} financing={loaded.financing}/></DirectoryShell>;
}
