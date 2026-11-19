import type {ReactNode} from 'react';
import {VEHICLE_TYPES} from '@/lib/directory/listing-schemas';
import {CR_PROVINCES,VEHICLE_TYPE_LABELS} from '@/lib/directory/listing-public';
import {ChipGroup,HomeHero,HomeLink,NeutralityNote,hrefWith} from './listing-home-parts';

/**
 * LOCAL PRO ONLY (multivertical V4): landing of /vehiculos. Server component; the search UI comes in as slots so this
 * file does not depend on the search components' internals: the page passes <SearchFilters/> as `filters` and
 * <SearchResults/> (which renders <ListingCard/>) as `results` (see dir-wiring-UI.md).
 */
export type VehiclesHomeProps={
 locale:string;
 /** Makes with at least one public listing, from ref_vehicle_makes (slug, name). */
 makes:{slug:string;name:string}[];
 /** Current query (to mark the selected chips). */
 selected?:{type?:string;make?:string;province?:string};
 filters?:ReactNode;results?:ReactNode;
 /** Pro inventory or V6 private-seller flow. */
 sellHref:string;
};
export function VehiclesHome({locale,makes,selected={},filters,results,sellHref}:VehiclesHomeProps){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,base=en?'/en/vehiculos':'/vehiculos';
 const keep=(patch:Record<string,string|undefined>)=>hrefWith(base,{...selected,...patch});
 return <main id="contenido" data-vehicles-home className="mx-auto max-w-6xl space-y-8 px-4 py-6 text-[#162543] sm:py-10">
  <HomeHero title={t('Vehículos en Costa Rica','Vehicles in Costa Rica')}
   lead={t('Carros, motos y más de agencias y particulares. Compare por precio, año y zona, y contacte directamente al vendedor.','Cars, motorcycles and more from dealers and private sellers. Compare by price, year and area, and contact the seller directly.')}
   actions={<HomeLink href={sellHref}>{t('Publicar un vehículo','List a vehicle')}</HomeLink>}/>
  <ChipGroup id="vehicles-types" title={t('Tipo','Type')} scroll chips={VEHICLE_TYPES.map(v=>({key:v,label:VEHICLE_TYPE_LABELS[v][en?'en':'es'],href:keep({type:selected.type===v?undefined:v}),current:selected.type===v}))}/>
  {/* Desktop (≥1024 px): compact sticky filter sidebar on the left, results on the right (2026-11-18 live demo). */}
  <div data-search-layout className="space-y-8 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
   {filters&&<section aria-label={t('Filtros de búsqueda','Search filters')} data-search-sidebar className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">{filters}</section>}
   {results&&<section aria-label={t('Resultados','Results')} className="min-w-0 lg:col-start-2">{results}</section>}
  </div>
  <ChipGroup id="vehicles-makes" title={t('Marcas','Makes')} chips={makes.map(m=>({key:m.slug,label:m.name,href:keep({make:selected.make===m.slug?undefined:m.slug}),current:selected.make===m.slug}))}/>
  <ChipGroup id="vehicles-provinces" title={t('Por provincia','By province')} chips={CR_PROVINCES.map(p=>({key:p,label:p,href:keep({province:selected.province===p?undefined:p}),current:selected.province===p}))}/>
  <NeutralityNote locale={locale}><p>{t('Los datos de cada anuncio los declara el vendedor. Vea el vehículo y sus documentos antes de pagar.','Each listing is declared by its seller. See the vehicle and its papers before paying.')}</p></NeutralityNote>
 </main>;
}
