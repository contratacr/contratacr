'use client';
import {useRouter} from 'next/navigation';
import {VehicleListingPage} from '@/components/directory/vehicle-listing-page';
import {PropertyListingPage} from '@/components/directory/property-listing-page';
import type {DeclaredFinancing,PublicListing} from '@/lib/directory/listing-public';

// LOCAL PRO ONLY (V4/R1): client bridge so the server page can hand callbacks to the detail components. Until V5
// (requests and test drives) exists, both actions go to «<url>/solicitar?accion=…» (page still pending, see the
// wiring report). Shared by /vehiculos/v/[slug] and /inmuebles/i/[slug].
export function ListingClient({listing,locale,path,financing}:{listing:PublicListing;locale:string;path:string;financing:DeclaredFinancing|null}){
 const router=useRouter();
 const go=(action:'interes'|'prueba'|'visita')=>router.push(`${path}/solicitar?accion=${action}`);
 const reportHref=`${locale==='en'?'/en':''}/ayuda?tema=reportar-anuncio&codigo=${listing.code}`;
 return listing.vertical==='vehiculos'
  ?<VehicleListingPage listing={listing} locale={locale} financing={financing} reportHref={reportHref} onInterest={()=>go('interes')} onScheduleTestDrive={()=>go('prueba')}/>
  :<PropertyListingPage listing={listing} locale={locale} reportHref={reportHref} onInterest={()=>go('interes')} onScheduleVisit={()=>go('visita')}/>;
}
