'use client';
import {AMENITY_LABELS,PROPERTY_TYPE_LABELS,formatMoney,formatNumber,type PublicPropertyListing} from '@/lib/directory/listing-public';
import {ContactActions,ListingFooter,ListingGallery,LocationLine,PriceBlock,SafetyNotice,SellerBlock,SpecList,StatusBadge,focusRing,tr,type Spec} from './listing-detail-parts';

/**
 * LOCAL PRO ONLY (multivertical R1): public detail of a property listing (/inmuebles/i/<slug>-<code>). Not imported
 * by any route yet (draft page in the scratchpad, see dir-wiring-UI.md). The location is always the fuzzed point
 * (approx 500 m); the exact address is never public. Rentals show the anti-scam notice.
 */
export type PropertyListingPageProps={
 listing:PublicPropertyListing;locale:string;
 onInterest:()=>void;onScheduleVisit?:()=>void;
 reportHref:string;
};
export function PropertyListingPage({listing,locale,onInterest,onScheduleVisit,reportHref}:PropertyListingPageProps){
 const t=tr(locale),en=locale==='en',section=en?'/en/inmuebles':'/inmuebles',rent=listing.operation==='rent';
 const yes=(v:boolean|null)=>v==null?null:v?t('Sí','Yes'):t('No','No');
 const type=PROPERTY_TYPE_LABELS[listing.propertyType]?.[en?'en':'es']??listing.propertyType;
 const specs:Spec[]=[
  {key:'operation',label:t('Operación','Operation'),value:rent?t('Alquiler','For rent'):t('Venta','For sale')},
  {key:'type',label:t('Tipo','Type'),value:type},
  {key:'bedrooms',label:t('Habitaciones','Bedrooms'),value:listing.bedrooms},
  {key:'bathrooms',label:t('Baños','Bathrooms'),value:listing.bathrooms!=null?formatNumber(listing.bathrooms,locale):null},
  {key:'parking',label:t('Parqueos','Parking spaces'),value:listing.parkingSpaces},
  {key:'built',label:t('Construcción','Built area'),value:listing.builtM2!=null?`${formatNumber(listing.builtM2,locale)} m²`:null},
  {key:'lot',label:t('Lote','Lot'),value:listing.lotM2!=null?`${formatNumber(listing.lotM2,locale)} m²`:null},
  {key:'floors',label:t('Pisos','Floors'),value:listing.floors},
  {key:'yearBuilt',label:t('Año de construcción','Year built'),value:listing.yearBuilt},
  {key:'furnished',label:t('Amueblado','Furnished'),value:yes(listing.furnished)},
  {key:'pets',label:t('Acepta mascotas','Pets allowed'),value:yes(listing.petsAllowed)},
  {key:'condo',label:t('En condominio','In a condominium'),value:yes(listing.inCondominium)},
  {key:'hoa',label:t('Cuota de mantenimiento','Maintenance fee'),value:listing.hoaFeeMinor!=null?`${formatMoney(listing.hoaFeeMinor,listing.currency,locale)} ${t('al mes','per month')}`:null},
  {key:'minLease',label:t('Plazo mínimo','Minimum lease'),value:rent&&listing.minLeaseMonths!=null?`${listing.minLeaseMonths} ${t('meses','months')}`:null},
 ];
 const reserved=listing.status==='reserved';
 return <main id="contenido" data-property-listing={listing.code} className="mx-auto max-w-5xl px-4 py-6 text-[#162543] sm:py-10">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="mb-4 text-sm">
   <ol className="flex flex-wrap items-center gap-1">
    <li><a className={`underline underline-offset-2 ${focusRing}`} href={section}>{t('Inmuebles','Real estate')}</a> ›</li>
    <li><a className={`underline underline-offset-2 ${focusRing}`} href={`${section}?operation=${rent?'rent':'sale'}`}>{rent?t('Alquiler','For rent'):t('Venta','For sale')}</a> ›</li>
    <li aria-current="page" className="text-slate-700">{type}</li>
   </ol>
  </nav>
  <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
   <div className="min-w-0 space-y-8">
    <ListingGallery photos={listing.photos} title={listing.title} locale={locale}/>
    <header className="space-y-2">
     <div className="flex flex-wrap items-center gap-2"><StatusBadge listing={listing} locale={locale}/>
      <span className="rounded-full border border-[#009FD9] bg-[#EBF5FB] px-3 py-1 text-sm font-semibold">{rent?t('Alquiler','For rent'):t('Venta','For sale')}</span></div>
     <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{listing.title}</h1>
    </header>
    <SpecList id="property-specs" title={t('Características','Key facts')} specs={specs}/>
    {listing.amenities.length>0&&<section aria-labelledby="property-amenities" className="space-y-2">
     <h2 id="property-amenities" className="text-lg font-bold">{t('Comodidades','Amenities')}</h2>
     <ul className="flex flex-wrap gap-2">{listing.amenities.map(a=><li key={a} className="rounded-full bg-[#f6f9fc] px-3 py-1 text-sm">{AMENITY_LABELS[a]?.[en?'en':'es']??a}</li>)}</ul></section>}
    {listing.description&&<section aria-labelledby="property-description" className="space-y-2">
     <h2 id="property-description" className="text-lg font-bold">{t('Descripción del anunciante','Advertiser description')}</h2>
     <p className="whitespace-pre-line break-words leading-relaxed">{listing.description}</p></section>}
    <section aria-labelledby="property-location" className="space-y-2">
     <h2 id="property-location" className="text-lg font-bold">{t('Ubicación','Location')}</h2>
     <LocationLine listing={listing} locale={locale} approximateNote/>
    </section>
   </div>
   <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" aria-label={t('Precio y contacto','Price and contact')}>
    <div className="space-y-4 rounded-2xl border border-[#d7e1ea] p-5 shadow-sm">
     <PriceBlock listing={listing} locale={locale} suffix={rent?t('al mes','per month'):undefined}/>
     <ContactActions locale={locale} onInterest={onInterest} onSchedule={onScheduleVisit} scheduleLabel={t('Agendar visita','Book a visit')} disabled={reserved}/>
    </div>
    <SellerBlock listing={listing} locale={locale}/>
    {rent
     ?<SafetyNotice tone="warning"><p className="font-semibold" data-listing-rent-warning>{t('No pague depósitos ni adelantos antes de visitar el inmueble.','Do not pay deposits or advances before visiting the property.')}</p>
      <p>{t('Confirme que quien alquila es el dueño o está autorizado, y firme un contrato antes de entregar dinero.','Confirm the landlord owns the property or is authorized, and sign a lease before handing over money.')}</p></SafetyNotice>
     :<SafetyNotice><p>{t('Antes de pagar, revise el plano catastrado y el estado registral de la propiedad en el Registro Nacional con un profesional de su confianza.','Before paying, check the survey plan and registry status of the property at the National Registry with a professional you trust.')}</p></SafetyNotice>}
   </aside>
  </div>
  <div className="mt-8"><ListingFooter listing={listing} locale={locale} reportHref={reportHref}/></div>
 </main>;
}
