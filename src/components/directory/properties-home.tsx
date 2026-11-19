import type {ReactNode} from 'react';
import {PROPERTY_TYPES} from '@/lib/directory/listing-schemas';
import {CR_PROVINCES,PROPERTY_TYPE_LABELS} from '@/lib/directory/listing-public';
import {ChipGroup,HomeHero,HomeLink,NeutralityNote,hrefWith} from './listing-home-parts';

/**
 * LOCAL PRO ONLY (multivertical R1): landing of /inmuebles. Server component; search UI via slots (`filters` =
 * <SearchFilters/>, `results` = <SearchResults/> with <ListingCard/>), see dir-wiring-UI.md.
 * Query keys (same as search-schemas FILTER_KEYS): operation (sale|rent), type, province.
 */
export type PropertiesHomeProps={
 locale:string;
 selected?:{operation?:'sale'|'rent';type?:string;province?:string};
 filters?:ReactNode;results?:ReactNode;
 sellHref:string;
};
export function PropertiesHome({locale,selected={},filters,results,sellHref}:PropertiesHomeProps){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,base=en?'/en/inmuebles':'/inmuebles';
 const keep=(patch:Record<string,string|undefined>)=>hrefWith(base,{...selected,...patch});
 const rent=selected.operation==='rent';
 return <main id="contenido" data-properties-home className="mx-auto max-w-6xl space-y-8 px-4 py-6 text-[#162543] sm:py-10">
  <HomeHero title={t('Casas, apartamentos y lotes','Homes, apartments and land')}
   lead={t('Propiedades en venta y alquiler de inmobiliarias y dueños. La ubicación exacta se comparte solo al coordinar una visita.','Properties for sale and rent from agencies and owners. The exact address is shared only when you arrange a visit.')}
   actions={<HomeLink href={sellHref}>{t('Publicar un inmueble','List a property')}</HomeLink>}/>
  <ChipGroup id="properties-operation" title={t('Operación','Operation')} chips={[
   {key:'sale',label:t('En venta','For sale'),href:keep({operation:selected.operation==='sale'?undefined:'sale'}),current:selected.operation==='sale'},
   {key:'rent',label:t('En alquiler','For rent'),href:keep({operation:rent?undefined:'rent'}),current:rent},
  ]}/>
  <ChipGroup id="properties-types" title={t('Tipo de inmueble','Property type')} scroll chips={PROPERTY_TYPES.map(p=>({key:p,label:PROPERTY_TYPE_LABELS[p][en?'en':'es'],href:keep({type:selected.type===p?undefined:p}),current:selected.type===p}))}/>
  {rent&&<aside role="note" data-properties-rent-warning className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-950">
   {t('No pague depósitos ni adelantos antes de visitar el inmueble y verificar a quien lo alquila.','Do not pay deposits or advances before visiting the property and verifying the landlord.')}</aside>}
  {/* Desktop (≥1024 px): compact sticky filter sidebar on the left, results on the right (2026-11-18 live demo). */}
  <div data-search-layout className="space-y-8 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
   {filters&&<section aria-label={t('Filtros de búsqueda','Search filters')} data-search-sidebar className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">{filters}</section>}
   {results&&<section aria-label={t('Resultados','Results')} className="min-w-0 lg:col-start-2">{results}</section>}
  </div>
  <ChipGroup id="properties-provinces" title={t('Por provincia','By province')} chips={CR_PROVINCES.map(p=>({key:p,label:p,href:keep({province:selected.province===p?undefined:p}),current:selected.province===p}))}/>
  <NeutralityNote locale={locale}><p>{t('En los mapas mostramos zonas aproximadas para proteger la dirección de cada propiedad.','Maps show approximate areas to protect each property’s address.')}</p></NeutralityNote>
 </main>;
}
