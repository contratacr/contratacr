import type {Metadata} from 'next';
import {alternativasDeIdioma} from '@/lib/seo/alternates';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {DIRECTORY_LISTINGS_ENABLED} from '@/lib/directory/feature-flags';

// F0 (ranking neutrality, LOCAL Pro branch): public explanation of how ContrataCR orders search results. Order never
// depends on payment: there is no paid placement, no "featured" boost and no Pro plan advantage. Keep this text in
// sync with src/lib/search/query-core.ts (professionals) and src/lib/directory/ranking.ts + dir_search (directory);
// scripts/pro/verify-directory-ranking-neutrality.mjs and verify-directory-neutrality-dynamic.mjs check the code.
// Paragraphs marked `listings` only apply to the vehicle/real-estate classified listings (OFF by owner decision).
type Block={id:string;title:[string,string];body:([string,string]|{listings:true;text:[string,string]})[]};
const BLOCKS:Block[]=[
 {id:'pagos',title:['El orden no se compra','Order cannot be bought'],body:[
  ['Ningún pago, plan Pro, suscripción ni anuncio cambia el lugar en que aparece un profesional, un negocio o un anuncio en los resultados.','No payment, Pro plan, subscription or advertising changes where a professional, a business or a listing appears in the results.'],
  ['Tampoco existe la posición "destacada" pagada. Si algún día se muestra publicidad, estará separada de los resultados y marcada claramente como publicidad.','There is no paid "featured" position either. If advertising is ever shown, it will be kept apart from the results and clearly labelled as advertising.'],
 ]},
 {id:'profesionales',title:['Profesionales','Professionals'],body:[
  ['Con "Mejor calificados" se ordena por las reseñas reales de clientes: se toma en cuenta tanto la calificación como cuántas reseñas tiene, para que una sola reseña de 5 estrellas no supere a muchas reseñas buenas.','With "Best rated", results follow real customer reviews: both the rating and the number of reviews count, so a single 5-star review does not outrank many good ones.'],
  ['Con evidencia igual, primero aparece quien verificó su identidad. Luego, quien trabaja en la zona que usted eligió.','With equal evidence, verified identity comes first. Then, those who work in the area you chose.'],
  ['También puede ordenar por cercanía, por precio o por experiencia. Cada orden usa solo ese criterio y los empates conservan un orden fijo.','You can also sort by distance, price or experience. Each order uses only that criterion, and ties keep a fixed order.'],
 ]},
 {id:'directorio',title:['Restaurantes, cafés, farmacias, supermercados, gasolineras y otros negocios','Restaurants, cafés, pharmacies, supermarkets, fuel stations and other businesses'],body:[
  ['"Más relevantes" usa, en este orden: qué tanto coincide el nombre con su búsqueda, si está en la zona elegida, la calificación de clientes (con un ajuste para pocas reseñas), cuántas reseñas tiene, si está verificado y qué tan completa está la ficha.','"Most relevant" uses, in this order: how well the name matches your search, whether it is in the chosen area, the customer rating (adjusted when there are few reviews), how many reviews it has, whether it is verified and how complete the listing is.'],
  {listings:true,text:['En anuncios de vehículos e inmuebles, un anuncio publicado en los últimos días puede quedar un poco más arriba solo para desempatar. Cuenta la fecha de publicación: editar un anuncio no lo vuelve a subir.','For vehicle and real-estate listings, a listing published in the last few days may rank slightly higher only to break ties. The publication date counts: editing a listing does not move it up again.']},
  {listings:true,text:['Los anuncios "Reservado" siguen visibles con esa etiqueta por si la negociación no se concreta.','"Reserved" listings stay visible with that label in case the deal does not go through.']},
  ['Se muestran todas las farmacias. Cada una indica si ContrataCR verificó su permiso de funcionamiento; esa verificación no cambia su posición más allá del criterio "verificado" descrito arriba. ContrataCR nunca muestra precios de medicamentos que requieren receta.','All pharmacies are shown. Each one states whether ContrataCR verified its operating licence; that check does not change its position beyond the "verified" criterion described above. ContrataCR never shows prices of prescription medicines.'],
  ['Puede filtrar y ordenar por precio en restaurantes y en cafés, panaderías y bares (precio típico: la mediana de los platos del menú publicado, con IVA y servicio) y en farmacias, supermercados, pulperías, ferreterías y tiendas de mascotas (precio vigente de un producto que usted escribe). En gasolineras no hay filtro de precio: el precio lo fija ARESEP y es igual en todo el país.','You can filter and sort by price at restaurants and at cafés, bakeries and bars (typical price: the median dish of the published menu, with VAT and service) and at pharmacies, supermarkets, corner stores, hardware stores and pet shops (current price of a product you type). Fuel stations have no price filter: ARESEP sets the price and it is the same across the country.'],
  ['En hospedaje, salud, talleres, belleza, gimnasios, tours y museos, bancos, parqueos, lavacar, atracciones, tiendas, centros comerciales, mercados y carnicerías, trámites, educación y transporte no hay filtro ni orden por precio: no publicamos tarifas de hospedaje, precios de consultas ni tasas bancarias.','Lodging, health, car services, beauty, gyms, tours and museums, banks, parking, car washes, attractions, stores, shopping centers, markets and butchers, public offices, education and transport have no price filter or price order: we publish no room rates, consultation prices or bank rates.'],
 ]},
 // Owner approval 2026-11-17: new place sections. Policy text pending lawyer review (docs/pro/directorio-verticales-nuevas.md).
 {id:'secciones-nuevas',title:['Salud, veterinarias, bancos, hospedaje, tours y secciones sin reseñas','Health, vets, banks, lodging, tours and sections without reviews'],body:[
  ['Salud y veterinarias: solo listamos establecimientos (clínicas, consultorios, laboratorios, ópticas, veterinarias), no a profesionales como personas. Cada ficha dice "Habilitación sin verificar por ContrataCR" hasta que verifiquemos su permiso; esa verificación no cambia su posición más allá del criterio "verificado". ContrataCR no da consejo médico ni veterinario, no recomienda tratamientos y no muestra precios de consultas. Las reseñas solo pueden referirse a la atención y el servicio.',
   'Health and vets: we only list facilities (clinics, practices, laboratories, opticians, vets), never practitioners as individuals. Each listing says "Permit not verified by ContrataCR" until we verify its permit; that check does not change its position beyond the "verified" criterion. ContrataCR gives no medical or veterinary advice, recommends no treatments and shows no consultation prices. Reviews may only be about attention and service.'],
  ['Bancos y cajeros: mostramos ubicación y horario. No comparamos tasas, comisiones ni productos financieros y no publicamos precios. Las reseñas solo pueden tratar sobre la atención y el servicio.','Banks and ATMs: we show location and hours. We do not compare rates, fees or financial products and publish no prices. Reviews may only be about attention and service.'],
  ['Eventos, marcas, preguntas y listas: la agenda de /eventos se ordena por fecha y hora de inicio; la página de una marca muestra sus sucursales por provincia y nombre; las preguntas van de la más reciente a la más antigua. Nada de esto depende de pagos, y el botón "Pedir" solo lleva al canal propio del negocio (ContrataCR no toma pedidos ni cobra comisiones).','Events, brands, questions and lists: the /eventos page is ordered by start date and time; a brand page lists its branches by province and name; questions go from newest to oldest. None of this depends on payment, and the "Order" button only leads to the business’s own channel (ContrataCR takes no orders and charges no commission).'],
  ['Hospedaje, tours y atracciones: no indicamos si un negocio cuenta con declaratoria turística del ICT ni mostramos categorías oficiales de estrellas. Confírmelo directamente con el negocio.','Lodging, tours and attractions: we do not state whether a business holds an ICT tourism declaration and show no official star ratings. Please confirm directly with the business.'],
  ['Sin reseñas: las oficinas públicas (Trámites), los centros comerciales, las escuelas y colegios, y las terminales de buses, ferris y aeropuertos no reciben reseñas ni muestran calificación. En Trámites, Centros comerciales, Educación y Transporte no existe el orden "Mejor calificados": el orden predeterminado es "Más relevantes". En Educación sí se reseñan universidades, guarderías y escuelas de idiomas, de manejo y de música; en Transporte, el alquiler de carros.','No reviews: public offices, shopping centers, schools and high schools, and bus, ferry and airport terminals take no reviews and show no rating. Public offices, Shopping centers, Education and Transport have no "Best rated" order: the default is "Most relevant". In Education, universities, daycares and language, driving and music schools can be reviewed; in Transport, car rental.'],
  ['Los datos iniciales de estas secciones vienen de OpenStreetMap (con su atribución en cada ficha). Cualquier negocio puede reclamar su ficha gratis o pedir que la retiremos.','The initial data in these sections comes from OpenStreetMap (attributed on every listing). Any business can claim its listing for free or ask us to remove it.'],
 ]},
 {id:'verificacion',title:['Reclamar o verificar es gratis','Claiming or verifying is free'],body:[
  ['Un negocio puede reclamar su ficha y verificarse sin costo. Eso permite mantener los datos al día, pero no da una mejor posición por sí mismo.','A business can claim its listing and get verified at no cost. That lets it keep its details up to date, but it does not buy a better position by itself.'],
 ]},
 {id:'precios',title:['Precios','Prices'],body:[
  ['Cada precio muestra de dónde viene (precio oficial, informado por el negocio o reportado por personas) y su fecha. Un precio viejo se muestra como desactualizado.','Every price shows where it comes from (official, reported by the business or by people) and its date. An old price is shown as out of date.'],
  ['El combustible tiene un precio nacional regulado por ARESEP, igual en todas las estaciones.','Fuel has a national price regulated by ARESEP, the same at every station.'],
 ]},
 {id:'reportar',title:['¿Ve algo incorrecto?','See something wrong?'],body:[
  ['Use "Reportar un problema" en la ficha. Revisamos los reportes y corregimos o retiramos la información cuando corresponde.','Use "Report a problem" on the business page. We review reports and correct or remove information when appropriate.'],
 ]},
];
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params,en=locale==='en';
 const title=en?'How we rank results':'Cómo ordenamos los resultados';
 const description=en?'ContrataCR never orders results by payment. See the criteria we use for professionals, businesses and listings.':'ContrataCR nunca ordena los resultados por pagos. Vea los criterios que usamos para profesionales, negocios y anuncios.';
 return {title:`${title} | ContrataCR`,description,alternates:alternativasDeIdioma(locale,'/como-ordenamos'),openGraph:{title,description,type:'article'}};
}
export default async function HowWeRankPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params,en=locale==='en',i=en?1:0;
 return <DirectoryShell footer="full"><main id="contenido" data-how-we-rank className="mx-auto max-w-3xl space-y-8 px-4 py-8 text-[#162543] sm:py-12">
  <header className="space-y-3">
   <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{en?'How we rank results':'Cómo ordenamos los resultados'}</h1>
   <p className="text-lg text-slate-700">{en?'ContrataCR orders results with the same neutral criteria for everyone. Order never depends on payment.':'ContrataCR ordena los resultados con los mismos criterios neutros para todos. El orden nunca depende de pagos.'}</p>
  </header>
  {BLOCKS.map(b=><section key={b.id} aria-labelledby={`rank-${b.id}`} data-rank-section={b.id} className="space-y-2">
   <h2 id={`rank-${b.id}`} className="text-xl font-bold">{b.title[i]}</h2>
   {b.body.flatMap(p=>Array.isArray(p)?[p]:DIRECTORY_LISTINGS_ENABLED?[p.text]:[]).map((p,n)=><p key={n} className="text-base leading-7 text-slate-800">{p[i]}</p>)}
  </section>)}
 </main></DirectoryShell>;
}
