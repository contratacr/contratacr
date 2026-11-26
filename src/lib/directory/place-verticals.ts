// LOCAL PRO ONLY (multivertical, owner approval 2026-11-17 «verticales nuevas»): single source of truth for the place
// sections of the Yelp-style directory. dir_verticals (docs/pro/sql/directory-core-local.sql) holds the same ids,
// names, paths and attribute keys; dir_search_place_verticals / dir_search_price_mode (directory-search-local.sql)
// hold the same section → vertical and price-mode mapping. Order never depends on payment: nothing here is commercial.
//
// Section key = Spanish path segment, the same in both languages (/hospedaje, /en/hospedaje), like /restaurantes.
// `kind` is the one subtype attribute every new vertical carries (derived from OpenStreetMap tags at import, editable
// by staff/owners); it is a search filter and a facet. Policy flags (pending lawyer review, docs/pro/directorio-verticales-nuevas.md):
//  - health:   establishments only (no individual practitioners), no consultation prices, no medical advice, reviews only
//              about service/attention (visible note), neutral licence line «Habilitación sin verificar por ContrataCR».
//  - mapOnly:  banks/ATMs: no prices, rates or products; the claim only fixes the listing. Since the owner decision of
//              2026-11-17 (later the same day) they accept reviews about service/attention only, with the health note.
//  - tourism:  lodging/tours never claim an ICT declaratoria; we show none.

export type PlaceKindDef={value:string;es:string;en:string};
export type PlaceSectionDef={
 /** Search vertical / path segment (Spanish, both locales). */
 section:string;
 /** dir_verticals.id */
 id:string;
 nameEs:string;nameEn:string;pathEn:string;
 /** Price filter: 'menu' (median of the published menu) | 'product' (current price of one typed product) | null. */
 priceMode:'menu'|'product'|null;
 kinds:readonly PlaceKindDef[];
 policy:{health?:boolean;mapOnly?:boolean;tourism?:boolean};
 /** True for the verticals added on 2026-11-17 (they carry `kind`). */
 added:boolean;
};
const k=(value:string,es:string,en:string):PlaceKindDef=>({value,es,en});

export const PLACE_SECTIONS=[
 {section:'restaurantes',id:'restaurant',nameEs:'Restaurantes',nameEn:'Restaurants',pathEn:'restaurants',priceMode:'menu',kinds:[],policy:{},added:false},
 {section:'cafes',id:'cafe_bar',nameEs:'Cafés, panaderías y bares',nameEn:'Cafés, bakeries and bars',pathEn:'cafes',priceMode:'menu',added:true,policy:{},
  kinds:[k('cafe','Café o cafetería','Café'),k('bakery','Panadería y repostería','Bakery and pastry shop'),k('bar','Bar','Bar'),k('pub','Pub o cervecería','Pub or brewpub'),
   k('ice_cream','Heladería','Ice cream shop'),k('coffee_shop','Tienda de café','Coffee store')]},
 {section:'gasolineras',id:'fuel',nameEs:'Gasolineras',nameEn:'Fuel stations',pathEn:'fuel-stations',priceMode:null,kinds:[],policy:{},added:false},
 {section:'farmacias',id:'pharmacy',nameEs:'Farmacias',nameEn:'Pharmacies',pathEn:'pharmacies',priceMode:'product',kinds:[],policy:{},added:false},
 {section:'supermercados',id:'grocery',nameEs:'Supermercados',nameEn:'Supermarkets',pathEn:'supermarkets',priceMode:'product',kinds:[],policy:{},added:false},
 {section:'pulperias',id:'convenience',nameEs:'Pulperías y minisúper',nameEn:'Corner stores and minimarts',pathEn:'corner-stores',priceMode:'product',added:true,policy:{},
  kinds:[k('pulperia','Pulpería','Corner store (pulpería)'),k('minisuper','Minisúper','Mini-market'),k('kiosk','Kiosco','Kiosk')]},
 {section:'ferreterias',id:'hardware',nameEs:'Ferreterías',nameEn:'Hardware stores',pathEn:'hardware-stores',priceMode:'product',added:true,policy:{},
  kinds:[k('hardware','Ferretería','Hardware store'),k('paint','Pinturas','Paint store'),k('building_materials','Materiales de construcción','Building materials'),
   k('electrical','Material eléctrico','Electrical supplies'),k('bathroom','Baños y loza sanitaria','Bathroom fittings'),k('diy','Hogar y bricolaje','Home improvement'),k('trade','Distribuidor para el oficio','Trade supplier')]},
 {section:'hospedaje',id:'lodging',nameEs:'Hospedaje',nameEn:'Lodging',pathEn:'lodging',priceMode:null,added:true,policy:{tourism:true},
  kinds:[k('hotel','Hotel','Hotel'),k('hostel','Hostal','Hostel'),k('guest_house','Casa de huéspedes','Guest house'),k('cabins','Cabinas','Cabins'),
   k('apartment','Apartamentos turísticos','Holiday apartments'),k('motel','Motel','Motel'),k('camping','Camping','Campsite'),
   // 2026-11-26 (owner): houses and apartments rented by the day, added by the team. Never named after a rental platform.
   k('vacation_rental','Casa o apartamento por días','Vacation rental')]},
 {section:'salud',id:'health',nameEs:'Salud',nameEn:'Health',pathEn:'health',priceMode:null,added:true,policy:{health:true},
  kinds:[k('clinic','Clínica','Clinic'),k('doctors','Consultorio médico','Medical practice'),k('dentist','Odontología','Dental practice'),k('hospital','Hospital','Hospital'),
   k('laboratory','Laboratorio clínico','Medical laboratory'),k('physiotherapy','Fisioterapia','Physiotherapy'),k('psychology','Psicología','Psychology'),
   k('optician','Óptica','Optician'),k('blood_bank','Banco de sangre','Blood bank'),k('other','Otros servicios de salud','Other health services')]},
 {section:'veterinarias',id:'vet_pets',nameEs:'Veterinarias y mascotas',nameEn:'Vets and pet shops',pathEn:'vets-and-pets',priceMode:'product',added:true,policy:{health:true},
  kinds:[k('veterinary','Veterinaria','Veterinary clinic'),k('pet_shop','Tienda de mascotas','Pet shop'),k('grooming','Estética canina y felina','Pet grooming'),k('boarding','Hospedaje de mascotas','Pet boarding')]},
 {section:'talleres',id:'auto_services',nameEs:'Talleres y servicios para vehículos',nameEn:'Auto repair and car services',pathEn:'car-services',priceMode:null,added:true,policy:{},
  kinds:[k('repair','Taller mecánico','Car repair'),k('motorcycle_repair','Taller de motos','Motorcycle repair'),k('car_wash','Lavacar','Car wash'),k('tyres','Llantera','Tire shop'),
   k('inspection','Revisión técnica vehicular','Vehicle inspection'),k('parts','Repuestos','Car parts')]},
 {section:'belleza',id:'beauty',nameEs:'Belleza',nameEn:'Beauty',pathEn:'beauty',priceMode:null,added:true,policy:{},
  kinds:[k('hairdresser','Peluquería y salón','Hair salon'),k('barber','Barbería','Barber shop'),k('beauty','Estética','Beauty salon'),k('nails','Uñas','Nail salon'),
   k('massage','Masajes','Massage'),k('spa','Spa','Spa'),k('tattoo','Tatuajes','Tattoo studio')]},
 {section:'gimnasios',id:'fitness',nameEs:'Gimnasios',nameEn:'Gyms',pathEn:'gyms',priceMode:null,added:true,policy:{},
  kinds:[k('gym','Gimnasio','Gym'),k('yoga','Yoga','Yoga'),k('crossfit','CrossFit y funcional','CrossFit and functional'),k('pilates','Pilates','Pilates'),
   k('dance','Baile','Dance'),k('martial_arts','Artes marciales','Martial arts'),k('sports_centre','Centro deportivo','Sports center')]},
 {section:'tours',id:'tours',nameEs:'Tours y atracciones',nameEn:'Tours and attractions',pathEn:'tours',priceMode:null,added:true,policy:{tourism:true},
  kinds:[k('attraction','Atracción','Attraction'),k('museum','Museo','Museum'),k('zoo','Zoológico o centro de rescate','Zoo or wildlife center'),k('theme_park','Parque temático','Theme park'),
   k('aquarium','Acuario','Aquarium'),k('gallery','Galería de arte','Art gallery'),k('water_park','Parque acuático','Water park'),k('tour_operator','Operador de tours','Tour operator'),
   k('travel_agency','Agencia de viajes','Travel agency')]},
 {section:'bancos',id:'banking',nameEs:'Bancos y cajeros',nameEn:'Banks and ATMs',pathEn:'banks',priceMode:null,added:true,policy:{mapOnly:true},
  kinds:[k('bank','Banco','Bank'),k('atm','Cajero automático','ATM'),k('exchange','Casa de cambio','Currency exchange')]},
 // 2026-11-26 (owner): parking and car washes, places the ContrataCR team adds by hand (admin form). No prices; map only on phones.
 {section:'parqueos',id:'parking',nameEs:'Parqueos',nameEn:'Parking',pathEn:'parking',priceMode:null,added:true,policy:{},
  kinds:[k('public','Parqueo público','Public parking'),k('covered','Parqueo techado o edificio','Covered or multi-storey parking'),
   k('motorcycle','Parqueo para motos','Motorcycle parking'),k('truck','Parqueo para camiones','Truck parking')]},
 {section:'lavacar',id:'car_wash',nameEs:'Lavacar',nameEn:'Car washes',pathEn:'car-wash',priceMode:null,added:true,policy:{},
  kinds:[k('car_wash','Lavacar','Car wash'),k('detailing','Detallado y estética automotriz','Car detailing'),k('self_service','Autolavado','Self-service car wash'),
   k('motorcycle_wash','Lavado de motos','Motorcycle wash')]},
] as const satisfies readonly PlaceSectionDef[];

export type PlaceSectionKey=typeof PLACE_SECTIONS[number]['section'];
export type PlaceVerticalId=typeof PLACE_SECTIONS[number]['id'];
/** Sections added on 2026-11-17 (in display order). */
export const NEW_PLACE_SECTIONS=PLACE_SECTIONS.filter(s=>s.added).map(s=>s.section) as PlaceSectionKey[];
export const placeSection=(section:string):PlaceSectionDef|null=>(PLACE_SECTIONS as readonly PlaceSectionDef[]).find(s=>s.section===section)??null;
export const placeSectionById=(id:string):PlaceSectionDef|null=>(PLACE_SECTIONS as readonly PlaceSectionDef[]).find(s=>s.id===id)??null;
/** ES/EN label of a place `kind` attribute, or null when unknown. */
export function kindLabel(verticalId:string,kind:unknown,en:boolean):string|null{
 if(typeof kind!=='string')return null;const d=placeSectionById(verticalId)?.kinds.find(x=>x.value===kind);return d?(en?d.en:d.es):null;
}
/** Health-like sections (salud, veterinarias): establishments only, no consultation prices, review note. */
export const isHealthVertical=(id:string)=>!!placeSectionById(id)?.policy.health;
/** Map-only sections (bancos): no prices, rates or products (reviews about service only since 2026-11-17). */
export const isMapOnlyVertical=(id:string)=>!!placeSectionById(id)?.policy.mapOnly;
/** Reviews limited to attention/service (visible note): health-like sections and banks. */
export const isServiceReviewVertical=(id:string)=>isHealthVertical(id)||isMapOnlyVertical(id);

/** Sections with the reservations/waitlist tool (owner opt-in). */
export const RESERVATION_VERTICALS=['restaurant','cafe_bar'] as const;
/** Sections with the «Pedir» link-out (same list as dir_order_vertical_ok in directory-place-tools-local.sql). */
export const ORDER_VERTICALS=['restaurant','cafe_bar','grocery','convenience','pharmacy','hardware','vet_pets'] as const;
const has=(list:readonly string[],id:string)=>list.includes(id);

/**
 * «What do you get by claiming?» list of the claim box, tailored to the section (owner request 2026-11-17): the menu only
 * for restaurants/cafés, product prices only where people compare products (pharmacies, supermarkets, corner stores,
 * hardware stores, vets/pet shops: the section's priceMode), nothing price-related for banks, health, lodging, tours,
 * beauty, gyms, car services or fuel (fuel prices are national, ARESEP). ES/EN pairs; order never depends on payment.
 */
export function claimBenefits(verticalId:string,proEnabled=true):[string,string][]{
 // Launch flag PRO_ENABLED off (src/lib/pro/enabled.ts): the claim opens «Mi negocio» (/dashboard/negocio, free, no Pro):
 // contact/hours, menu with prices (restaurants/cafés), table reservations + waitlist, events and «Pedir», review and
 // question replies, photos. Product prices and customer messages are Pro-only today, so they are not promised.
 const sec=placeSectionById(verticalId),out:[string,string][]=[];
 out.push(isMapOnlyVertical(verticalId)
  ?['Corregir la dirección, el horario y los datos de contacto de su sucursal.','Correct your branch address, hours and contact details.']
  :['Corregir los datos, el horario y las fotos de su negocio.','Correct your business details, hours and photos.']);
 if(sec?.priceMode==='menu')out.push(['Publicar su menú con precios finales.','Publish your menu with final prices.']);
 else if(proEnabled&&sec?.priceMode==='product')out.push(['Publicar los precios de sus productos.','Publish your product prices.']);
 if(has(RESERVATION_VERTICALS,verticalId))out.push(['Recibir reservas de mesa y manejar una lista de espera (si las activa).','Take table reservations and run a waitlist (if you turn them on).']);
 if(has(ORDER_VERTICALS,verticalId))out.push(['Agregar un botón "Pedir" que lleva a su propio WhatsApp, sitio web o teléfono.','Add an "Order" button that leads to your own WhatsApp, website or phone.']);
 if(!isMapOnlyVertical(verticalId))out.push(['Publicar eventos de su negocio en la agenda de ContrataCR.','Publish your business events on the ContrataCR events page.']);
 out.push(['Responder las reseñas y preguntas de sus clientes.','Reply to your customers’ reviews and questions.']);
 out.push(['Mostrar que la ficha la administra el negocio (y el sello de verificado si presenta documentos o cédula jurídica).','Show that the business manages its page (and the verified badge if you submit documents or your corporate ID).']);
 if(proEnabled&&!isMapOnlyVertical(verticalId))out.push(['Recibir mensajes de clientes.','Receive messages from customers.']);
 if(proEnabled)out.push(['Usar las herramientas Pro gratis durante el lanzamiento.','Use the Pro tools for free during the launch.']);
 if(!proEnabled)out.push(['Administrarlo todo gratis desde "Mi negocio" en su cuenta.','Manage it all for free from "My business" in your account.']);
 return out;
}
