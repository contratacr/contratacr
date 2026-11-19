'use client';
import {DRIVETRAIN_LABELS,FUEL_LABELS,TRANSMISSION_LABELS,VEHICLE_TYPE_LABELS,formatNumber,label,type DeclaredFinancing,type PublicVehicleListing} from '@/lib/directory/listing-public';
import {FinanceCalculator} from './finance-calculator';
import {ContactActions,ListingFooter,ListingGallery,LocationLine,PriceBlock,SafetyNotice,SellerBlock,SpecList,StatusBadge,focusRing,tr,type Spec} from './listing-detail-parts';

/**
 * LOCAL PRO ONLY (multivertical V4): public detail of a vehicle listing (/vehiculos/v/<slug>-<code>). Not imported by
 * any route yet (draft page in the scratchpad, see dir-wiring-UI.md). Contact actions are callbacks so the route
 * decides what they do (V5 request form / login). Marchamo, RTV and taxes are shown as seller DECLARATIONS.
 */
export type VehicleListingPageProps={
 listing:PublicVehicleListing;locale:string;
 onInterest:()=>void;onScheduleTestDrive?:()=>void;
 /** Only dealers that declared terms; the calculator is hidden otherwise. */
 financing?:DeclaredFinancing|null;
 reportHref:string;
};
export function VehicleListingPage({listing,locale,onInterest,onScheduleTestDrive,financing,reportHref}:VehicleListingPageProps){
 const t=tr(locale),en=locale==='en',section=en?'/en/vehiculos':'/vehiculos';
 const yesNo=(v:boolean|null)=>v==null?null:v?t('Sí (declarado)','Yes (declared)'):t('No (declarado)','No (declared)');
 const specs:Spec[]=[
  {key:'year',label:t('Año','Year'),value:listing.year||null},
  {key:'condition',label:t('Condición','Condition'),value:listing.condition==='new'?t('Nuevo','New'):t('Usado','Used')},
  {key:'mileage',label:t('Kilometraje','Mileage'),value:listing.mileageKm!=null?`${formatNumber(listing.mileageKm,locale)} km`:null},
  {key:'transmission',label:t('Transmisión','Transmission'),value:label(TRANSMISSION_LABELS,listing.transmission,locale)},
  {key:'fuel',label:t('Combustible','Fuel'),value:label(FUEL_LABELS,listing.fuel,locale)},
  {key:'drivetrain',label:t('Tracción','Drivetrain'),value:label(DRIVETRAIN_LABELS,listing.drivetrain,locale)},
  {key:'engine',label:t('Motor','Engine'),value:listing.engineCc!=null?`${formatNumber(listing.engineCc,locale)} cc`:null},
  {key:'type',label:t('Tipo','Type'),value:VEHICLE_TYPE_LABELS[listing.vehicleType]?.[en?'en':'es']??null},
  {key:'doors',label:t('Puertas','Doors'),value:listing.doors},
  {key:'seats',label:t('Asientos','Seats'),value:listing.seats},
  {key:'color',label:t('Color','Color'),value:listing.color},
 ];
 const papers:Spec[]=[
  {key:'marchamo',label:t('Marchamo al día','Road tax (marchamo) paid'),value:yesNo(listing.marchamoCurrentDeclared)},
  {key:'rtv',label:t('RTV al día','Inspection (RTV) current'),value:yesNo(listing.rtvCurrentDeclared)},
  {key:'taxes',label:t('Impuestos al día','Taxes paid'),value:yesNo(listing.taxesPaidDeclared)},
  {key:'tradeIn',label:t('Recibe vehículo','Accepts trade-in'),value:listing.acceptsTradeIn?t('Sí','Yes'):null},
  {key:'financing',label:t('Financiamiento del vendedor','Seller financing'),value:listing.sellerFinancing?t('Disponible','Available'):null},
 ];
 const heading=`${listing.makeName} ${listing.modelName}${listing.version?' '+listing.version:''} ${listing.year}`;
 const reserved=listing.status==='reserved';
 return <main id="contenido" data-vehicle-listing={listing.code} className="mx-auto max-w-5xl px-4 py-6 text-[#162543] sm:py-10">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="mb-4 text-sm">
   <ol className="flex flex-wrap items-center gap-1">
    <li><a className={`underline underline-offset-2 ${focusRing}`} href={section}>{t('Vehículos','Vehicles')}</a> ›</li>
    <li><a className={`underline underline-offset-2 ${focusRing}`} href={`${section}?make=${encodeURIComponent(listing.makeSlug)}`}>{listing.makeName}</a> ›</li>
    <li aria-current="page" className="text-slate-700">{listing.modelName}</li>
   </ol>
  </nav>
  <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
   <div className="min-w-0 space-y-8">
    <ListingGallery photos={listing.photos} title={heading} locale={locale}/>
    <header className="space-y-2">
     <div className="flex flex-wrap items-center gap-2"><StatusBadge listing={listing} locale={locale}/>
      {listing.condition==='new'&&<span className="rounded-full border border-[#009FD9] bg-[#EBF5FB] px-3 py-1 text-sm font-semibold">{t('Nuevo','New')}</span>}</div>
     <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{listing.title}</h1>
     <p className="text-base text-slate-700">{heading}</p>
    </header>
    <SpecList id="vehicle-specs" title={t('Características','Key specs')} specs={specs}/>
    {listing.description&&<section aria-labelledby="vehicle-description" className="space-y-2">
     <h2 id="vehicle-description" className="text-lg font-bold">{t('Descripción del vendedor','Seller description')}</h2>
     <p className="whitespace-pre-line break-words leading-relaxed">{listing.description}</p></section>}
    <SpecList id="vehicle-papers" title={t('Documentos y condiciones','Papers and terms')} specs={papers}/>
    <p className="text-sm text-slate-700">{t('Marchamo, RTV e impuestos son declaraciones del vendedor: ContrataCR no los verifica. Confírmelos en el Registro Nacional y el INS antes de pagar.','Road tax, inspection and taxes are seller declarations that ContrataCR does not verify. Confirm them with the National Registry and INS before paying.')}</p>
   </div>
   <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" aria-label={t('Precio y contacto','Price and contact')}>
    <div className="space-y-4 rounded-2xl border border-[#d7e1ea] p-5 shadow-sm">
     <PriceBlock listing={listing} locale={locale}/>
     <LocationLine listing={listing} locale={locale}/>
     <ContactActions locale={locale} onInterest={onInterest} onSchedule={onScheduleTestDrive} scheduleLabel={t('Agendar prueba de manejo','Book a test drive')} disabled={reserved}/>
    </div>
    <SellerBlock listing={listing} locale={locale}/>
    <SafetyNotice><p>{t('Vea el vehículo en persona y revise los documentos antes de entregar dinero. No pague apartados por transferencia a desconocidos.','See the vehicle in person and check the papers before handing over money. Do not send holding deposits to strangers.')}</p></SafetyNotice>
   </aside>
  </div>
  {listing.sellerKind==='business'&&<div className="mt-8 max-w-3xl"><FinanceCalculator priceMinor={listing.priceMinor} currency={listing.currency} financing={financing} locale={locale}/></div>}
  <div className="mt-8"><ListingFooter listing={listing} locale={locale} reportHref={reportHref}/></div>
 </main>;
}
