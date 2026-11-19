import type {ReactNode} from 'react';
import {CR_PROVINCES} from '@/lib/directory/listing-public';
import {placeSection} from '@/lib/directory/place-verticals';
import {ChipGroup,HomeHero,NeutralityNote,hrefWith} from './listing-home-parts';

/**
 * LOCAL PRO ONLY (multivertical F6): landing of a places section (/restaurantes, /farmacias, /supermercados,
 * /gasolineras and, since the owner approval of 2026-11-17, /cafes, /pulperias, /ferreterias, /hospedaje, /salud,
 * /veterinarias, /talleres, /belleza, /gimnasios, /tours, /bancos). Server component; the search UI comes in as slots
 * (filters/results) like /vehiculos. New sections add «Por tipo» chips (attributes.kind) next to the province chips.
 * `policy` notes (health, banks, tourism) are pending lawyer review (docs/pro/directorio-verticales-nuevas.md).
 */
export type PlaceSection='restaurantes'|'farmacias'|'supermercados'|'gasolineras'|'cafes'|'pulperias'|'ferreterias'|'hospedaje'|'salud'|
 'veterinarias'|'talleres'|'belleza'|'gimnasios'|'tours'|'bancos';
type Copy={title:[string,string];lead:[string,string];note:[string,string];policy?:[string,string]};
const CONFIRM:[string,string]=['Confirme horario y servicios con el negocio antes de ir.','Please confirm hours and services with the business before going.'];
const COPY:Record<PlaceSection,Copy>={
 restaurantes:{title:['Restaurantes en Costa Rica','Restaurants in Costa Rica'],
  lead:['Sodas y restaurantes. Vea horarios, ubicación, menú con precio final y reseñas de clientes. Cafés, panaderías y bares están en su propia sección.','Sodas and restaurants. See opening hours, location, menus with final prices and customer reviews. Cafés, bakeries and bars have their own section.'],
  note:['El menú y sus precios los informa cada negocio. El precio final incluye impuestos y servicio cuando corresponde.','Each business reports its own menu and prices. The final price includes taxes and service where applicable.']},
 farmacias:{title:['Farmacias en Costa Rica','Pharmacies in Costa Rica'],
  lead:['Farmacias de todo el país. Vea horarios, ubicación, si ContrataCR verificó su permiso y precios de productos de venta libre.','Pharmacies across the country. See opening hours, location, whether ContrataCR verified their license and over-the-counter prices.'],
  note:['Cada farmacia indica si su permiso de funcionamiento está verificado por ContrataCR. ContrataCR nunca muestra precios de medicamentos que requieren receta.','Each pharmacy shows whether ContrataCR verified its operating license. ContrataCR never shows prices of prescription medicines.']},
 supermercados:{title:['Supermercados en Costa Rica','Supermarkets in Costa Rica'],
  lead:['Supermercados por zona. Vea horarios, ubicación y precios informados de productos básicos. Las pulperías y los minisúper están en su propia sección.','Supermarkets by area. See opening hours, location and reported prices of basic products. Corner stores and mini-markets have their own section.'],
  note:['Cada precio muestra su fuente y su fecha. Un precio viejo aparece como desactualizado.','Every price shows its source and date. An old price is marked as out of date.']},
 gasolineras:{title:['Gasolineras en Costa Rica','Fuel stations in Costa Rica'],
  lead:['Estaciones de servicio por zona, horario y servicios. El precio del combustible lo fija ARESEP y es igual en todo el país.','Fuel stations by area, hours and services. Fuel prices are set by ARESEP and are the same across the country.'],
  note:['Compare estaciones por servicios, horario y distancia: el precio regulado no cambia entre estaciones.','Compare stations by services, hours and distance: the regulated price does not change between stations.']},
 cafes:{title:['Cafés, panaderías y bares en Costa Rica','Cafés, bakeries and bars in Costa Rica'],
  lead:['Cafeterías, panaderías, heladerías, bares y pubs. Vea horarios, ubicación, menú con precio final y reseñas de clientes.','Cafés, bakeries, ice cream shops, bars and pubs. See opening hours, location, menus with final prices and customer reviews.'],
  note:['El menú y sus precios los informa cada negocio. El precio típico es la mediana del menú publicado, con IVA y servicio.','Each business reports its own menu and prices. The typical price is the median of the published menu, with VAT and service.']},
 pulperias:{title:['Pulperías y minisúper en Costa Rica','Corner stores in Costa Rica'],
  lead:['Pulperías, minisúper, abastecedores y kioscos del barrio. Vea horarios, ubicación y precios informados de productos.','Neighborhood corner stores, mini-markets and kiosks. See opening hours, location and reported product prices.'],
  note:['Cada precio muestra su fuente y su fecha. Las tiendas de las gasolineras se muestran en la ficha de la gasolinera.','Every price shows its source and date. Fuel-station shops are shown on the fuel station page.']},
 ferreterias:{title:['Ferreterías en Costa Rica','Hardware stores in Costa Rica'],
  lead:['Ferreterías, pinturas, material eléctrico y materiales de construcción. Vea horarios, ubicación y precios informados de productos.','Hardware, paint, electrical and building-material stores. See opening hours, location and reported product prices.'],
  note:['Escriba un producto para comparar su precio entre ferreterías. Cada precio muestra su fuente y su fecha.','Type a product to compare its price across hardware stores. Every price shows its source and date.']},
 hospedaje:{title:['Hospedaje en Costa Rica','Lodging in Costa Rica'],
  lead:['Hoteles, hostales, cabinas, casas de huéspedes y campings. Vea ubicación, horario de recepción y reseñas de huéspedes.','Hotels, hostels, cabins, guest houses and campsites. See location, reception hours and guest reviews.'],
  note:CONFIRM,
  policy:['ContrataCR no indica si un hospedaje cuenta con declaratoria turística del ICT ni muestra categorías oficiales de estrellas. Confírmelo directamente con el hospedaje.','ContrataCR does not state whether a lodging holds an ICT tourism declaration and shows no official star ratings. Please confirm directly with the lodging.']},
 salud:{title:['Establecimientos de salud en Costa Rica','Health facilities in Costa Rica'],
  lead:['Clínicas, consultorios, odontología, laboratorios, ópticas y servicios públicos (EBAIS y CCSS). Vea ubicación y horario.','Clinics, medical and dental practices, laboratories, opticians and public services (EBAIS and CCSS). See location and hours.'],
  note:['En una emergencia llame al 9-1-1.','In an emergency, call 9-1-1.'],
  policy:['Solo listamos establecimientos, no profesionales individuales. ContrataCR no da consejo médico, no recomienda tratamientos ni muestra precios de consultas. Cada ficha dice «Habilitación sin verificar por ContrataCR» hasta que verifiquemos su permiso. Las reseñas solo pueden referirse a la atención y el servicio.',
   'We only list facilities, not individual practitioners. ContrataCR gives no medical advice, recommends no treatments and shows no consultation prices. Each listing says “Permit not verified by ContrataCR” until we verify its permit. Reviews may only be about attention and service.']},
 veterinarias:{title:['Veterinarias y tiendas de mascotas en Costa Rica','Vets and pet shops in Costa Rica'],
  lead:['Veterinarias, tiendas de mascotas, estéticas y hospedaje de mascotas. Vea horarios, ubicación y precios informados de productos para mascotas.','Vets, pet shops, groomers and pet boarding. See opening hours, location and reported prices of pet products.'],
  note:['Los precios son de productos (alimento, accesorios), nunca de consultas ni tratamientos.','Prices are for products (food, accessories), never for consultations or treatments.'],
  policy:['ContrataCR no da consejo veterinario ni recomienda tratamientos. Cada veterinaria dice «Habilitación sin verificar por ContrataCR» hasta que verifiquemos su permiso. Las reseñas solo pueden referirse a la atención y el servicio.',
   'ContrataCR gives no veterinary advice and recommends no treatments. Each vet says “Permit not verified by ContrataCR” until we verify its permit. Reviews may only be about attention and service.']},
 talleres:{title:['Talleres y servicios para vehículos en Costa Rica','Car services in Costa Rica'],
  lead:['Talleres mecánicos, talleres de motos, lavacar, llanteras, repuestos y revisión técnica vehicular. Vea horarios, ubicación y reseñas.','Car and motorcycle repair, car washes, tire shops, parts and vehicle inspection. See opening hours, location and reviews.'],
  note:CONFIRM},
 belleza:{title:['Belleza en Costa Rica','Beauty in Costa Rica'],
  lead:['Peluquerías, barberías, estéticas, uñas, masajes, spas y estudios de tatuaje. Vea horarios, ubicación y reseñas.','Hair salons, barbers, beauty and nail salons, massage, spas and tattoo studios. See opening hours, location and reviews.'],
  note:CONFIRM},
 gimnasios:{title:['Gimnasios en Costa Rica','Gyms in Costa Rica'],
  lead:['Gimnasios, yoga, pilates, CrossFit, baile y artes marciales. Vea horarios, ubicación y reseñas.','Gyms, yoga, pilates, CrossFit, dance and martial arts. See opening hours, location and reviews.'],
  note:CONFIRM},
 tours:{title:['Tours y atracciones en Costa Rica','Tours and attractions in Costa Rica'],
  lead:['Atracciones, museos, zoológicos y centros de rescate, parques y agencias de tours. Vea ubicación, horario y reseñas de visitantes.','Attractions, museums, zoos and wildlife centers, parks and tour agencies. See location, hours and visitor reviews.'],
  note:CONFIRM,
  policy:['ContrataCR no indica si un operador de tours cuenta con declaratoria turística del ICT ni infiere licencias. Confírmelo directamente con el operador.','ContrataCR does not state whether a tour operator holds an ICT tourism declaration and infers no licenses. Please confirm directly with the operator.']},
 bancos:{title:['Bancos y cajeros en Costa Rica','Banks and ATMs in Costa Rica'],
  lead:['Sucursales bancarias, cajeros automáticos y casas de cambio en el mapa, con horario.','Bank branches, ATMs and currency exchanges on the map, with hours.'],
  note:['Confirme el horario con la entidad antes de ir.','Please confirm the hours with the institution before going.'],
  policy:['Solo mostramos ubicación y horario. ContrataCR no compara tasas, comisiones ni productos financieros, no publica precios y estas fichas no admiten reseñas.','We only show location and hours. ContrataCR does not compare rates, fees or financial products, publishes no prices, and these listings take no reviews.']},
};
export function PlacesSectionHome({section,locale,selected={},banner,filters,results}:{section:PlaceSection;locale:string;selected?:{province?:string;kind?:string};banner?:ReactNode;filters?:ReactNode;results?:ReactNode}){
 const en=locale==='en',i=en?1:0,c=COPY[section],base=(en?'/en/':'/')+section,t=(es:string,english:string)=>en?english:es;
 const kinds=placeSection(section)?.kinds??[];
 return <main id="contenido" data-places-home={section} className="mx-auto max-w-6xl space-y-8 px-4 py-6 text-[#162543] sm:py-10">
  <HomeHero title={c.title[i]} lead={c.lead[i]}/>
  {banner}
  {c.policy&&<p role="note" data-section-policy={section} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">{c.policy[i]}</p>}
  <ChipGroup id={`${section}-provinces`} title={t('Por provincia','By province')} scroll chips={CR_PROVINCES.map(p=>({key:p,label:p,href:hrefWith(base,{province:selected.province===p?undefined:p,kind:selected.kind}),current:selected.province===p}))}/>
  {kinds.length>0&&<ChipGroup id={`${section}-kinds`} title={t('Por tipo','By type')} scroll chips={kinds.map(k=>({key:`kind-${k.value}`,label:en?k.en:k.es,href:hrefWith(base,{kind:selected.kind===k.value?undefined:k.value,province:selected.province}),current:selected.kind===k.value}))}/>}
  {/* Desktop (≥1024 px): compact sticky filter sidebar on the left, results on the right (2026-11-18 live demo). */}
  <div data-search-layout className="space-y-8 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
   {filters&&<section aria-label={t('Filtros de búsqueda','Search filters')} data-search-sidebar className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">{filters}</section>}
   {results&&<section aria-label={t('Resultados','Results')} className="min-w-0 lg:col-start-2">{results}</section>}
  </div>
  <NeutralityNote locale={locale}><p>{c.note[i]}</p></NeutralityNote>
 </main>;
}
