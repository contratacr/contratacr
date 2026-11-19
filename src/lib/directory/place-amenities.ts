/**
 * «Comodidades y más» of a place page (2026-11-19, Yelp model). Only facts stored in the place's typed attributes
 * (schemas.ts verticalAttributeSchemas) become rows; nothing is inferred or invented. Each entry: stable key, icon
 * name (lucide) and the label in the page language.
 */
export type Amenity={key:string;icon:string;es:string;en:string};
const FUELS:Record<string,[string,string]>={regular:['Gasolina regular','Regular gasoline'],super:['Gasolina súper','Super gasoline'],diesel:['Diésel','Diesel'],lpg:['Gas LP','LPG'],electric:['Carga eléctrica','EV charging']};
const SERVICES:Record<string,[string,string,string]>={shop:['Store','Tienda','Shop'],air:['Wind','Aire para llantas','Tyre air'],car_wash:['Droplets','Lavacar','Car wash'],restroom:['Bath','Servicios sanitarios','Restrooms'],atm:['Banknote','Cajero automático','ATM'],
 repair:['Wrench','Mecánica','Repairs'],motorcycle_repair:['Wrench','Taller de motos','Motorcycle repair'],tyres:['Car','Llantas','Tyres'],inspection:['FileText','Revisión técnica','Vehicle inspection'],parts:['Wrench','Repuestos','Parts']};
const PAYMENTS:Record<string,[string,string,string]>={cash:['Banknote','Efectivo','Cash'],card:['CreditCard','Tarjeta','Card'],sinpe:['Smartphone','SINPE Móvil','SINPE Móvil'],transfer:['ArrowLeftRight','Transferencia','Bank transfer']};
const FLAGS:[string,string,string,string][]=[
 ['open24h','Clock','Abierto 24 horas','Open 24 hours'],['delivery','Truck','Servicio a domicilio','Delivery'],['takeaway','ShoppingBag','Para llevar','Takeaway'],
 ['reservations','CalendarCheck','Acepta reservas','Takes reservations'],['vegetarianOptions','Leaf','Opciones vegetarianas','Vegetarian options'],
 ['serviceCharge','Percent','Cobra 10 % de servicio','10 % service charge'],['onDuty','Pill','Farmacia de turno','On-duty pharmacy'],
 ['acceptsPrescriptions','FileText','Recibe recetas','Accepts prescriptions'],['pool','Waves','Piscina','Pool'],['wifi','Wifi','Wifi','Wi-Fi'],
 ['parking','CircleParking','Parqueo','Parking'],['breakfast','Coffee','Desayuno incluido','Breakfast'],['petFriendly','PawPrint','Acepta mascotas','Pet friendly'],
 ['emergency','Siren','Atiende emergencias','Emergency care'],['atm','Banknote','Cajero automático','ATM'],['byAppointment','CalendarClock','Con cita previa','By appointment'],
 ['newVehicles','Car','Vehículos nuevos','New vehicles'],['usedVehicles','Car','Vehículos usados','Used vehicles'],['financing','Landmark','Financiamiento','Financing'],['workshop','Wrench','Taller','Workshop'],
];
export function placeAmenities(attributes:Record<string,unknown>,{open24}:{open24?:boolean}={}):Amenity[]{
 const out:Amenity[]=[];const a=attributes??{};
 for(const [key,icon,es,en] of FLAGS){if(a[key]===true||(key==='open24h'&&open24))out.push({key,icon,es,en});}
 const list=(k:string)=>Array.isArray(a[k])?(a[k] as unknown[]).filter((x):x is string=>typeof x==='string'):[];
 for(const f of list('fuels'))if(FUELS[f])out.push({key:'fuel:'+f,icon:f==='electric'?'Zap':'Fuel',es:FUELS[f][0],en:FUELS[f][1]});
 for(const s of list('services'))if(SERVICES[s])out.push({key:'service:'+s,icon:SERVICES[s][0],es:SERVICES[s][1],en:SERVICES[s][2]});
 for(const p of list('paymentMethods'))if(PAYMENTS[p])out.push({key:'pay:'+p,icon:PAYMENTS[p][0],es:PAYMENTS[p][1],en:PAYMENTS[p][2]});
 return out;
}
/** Free-text cuisines (restaurants/cafés), max 10 by schema. */
export const placeCuisines=(attributes:Record<string,unknown>)=>Array.isArray(attributes?.cuisines)?(attributes.cuisines as unknown[]).filter((x):x is string=>typeof x==='string'&&x.trim().length>0):[];
/** Price level 1–4 (restaurants/cafés) as colón signs, or null. */
export const placePriceLevel=(attributes:Record<string,unknown>)=>{const n=attributes?.priceLevel;return typeof n==='number'&&n>=1&&n<=4?'₡'.repeat(n):null;};
