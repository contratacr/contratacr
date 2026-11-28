/**
 * «¿Sabe si este lugar…?» (migration 548, 2026-11-27, Google Maps model). Keys asked per section — the same list as
 * dir_attr_question_keys in SQL — and their texts. An answer is Sí / No / No sé; a key becomes «Según clientes» after
 * ≥ 3 matching yes/no answers with ≥ 75 % agreement. A key the place already has (business, staff or import) is never asked.
 */
export const ATTR_QUESTION_KEYS:Record<string,readonly string[]>={
 restaurant:['reservations','delivery','takeaway','sinpe','parking','wifi','terrace','vegetarianOptions','petFriendly','accessible'],
 cafe_bar:['reservations','delivery','takeaway','sinpe','parking','wifi','terrace','vegetarianOptions','petFriendly','accessible'],
 lodging:['wifi','parking','pool','breakfast','petFriendly','sinpe','accessible'],
 beauty:['byAppointment','sinpe','parking','accessible'],
 ...Object.fromEntries(['convenience','grocery','hardware','pharmacy','vet_pets','food_shop'].map(v=>[v,['sinpe','delivery','parking','accessible']])),
 ...Object.fromEntries(['retail','auto_services','car_wash','fitness','tours'].map(v=>[v,['sinpe','parking','accessible']])),
 fuel:['sinpe','accessible'],
 ...Object.fromEntries(['banking','government','health','education','mall','transport','attraction'].map(v=>[v,['parking','accessible']])),
};
export const ATTR_ANSWERS=['yes','no','unsure'] as const;
export type AttrAnswer=typeof ATTR_ANSWERS[number];
/** [question ES, question EN, yes label ES, yes label EN, no label ES, no label EN, lucide icon]. */
const T:Record<string,[string,string,string,string,string,string,string]>={
 reservations:['¿Sabe si este lugar acepta reservas?','Do you know if this place takes reservations?','Acepta reservas','Takes reservations','No acepta reservas','No reservations','CalendarCheck'],
 delivery:['¿Sabe si este lugar tiene servicio a domicilio (exprés)?','Do you know if this place delivers?','Servicio a domicilio','Delivery','Sin servicio a domicilio','No delivery','Truck'],
 takeaway:['¿Sabe si este lugar vende para llevar?','Do you know if this place does takeaway?','Para llevar','Takeaway','No vende para llevar','No takeaway','ShoppingBag'],
 sinpe:['¿Sabe si este lugar acepta SINPE Móvil?','Do you know if this place accepts SINPE Móvil?','Acepta SINPE Móvil','Accepts SINPE Móvil','No acepta SINPE Móvil','No SINPE Móvil','Smartphone'],
 parking:['¿Sabe si este lugar tiene parqueo?','Do you know if this place has parking?','Parqueo','Parking','Sin parqueo','No parking','CircleParking'],
 wifi:['¿Sabe si este lugar tiene wifi para clientes?','Do you know if this place has Wi-Fi for customers?','Wifi','Wi-Fi','Sin wifi','No Wi-Fi','Wifi'],
 terrace:['¿Sabe si este lugar tiene terraza o mesas al aire libre?','Do you know if this place has outdoor seating?','Terraza o mesas afuera','Outdoor seating','Sin mesas afuera','No outdoor seating','Store'],
 vegetarianOptions:['¿Sabe si este lugar tiene opciones vegetarianas?','Do you know if this place has vegetarian options?','Opciones vegetarianas','Vegetarian options','Sin opciones vegetarianas','No vegetarian options','Leaf'],
 petFriendly:['¿Sabe si este lugar acepta mascotas?','Do you know if this place allows pets?','Acepta mascotas','Pet friendly','No acepta mascotas','No pets','PawPrint'],
 accessible:['¿Sabe si este lugar tiene acceso para silla de ruedas?','Do you know if this place is wheelchair accessible?','Acceso para silla de ruedas','Wheelchair accessible','Sin acceso para silla de ruedas','Not wheelchair accessible','Accessibility'],
 pool:['¿Sabe si este lugar tiene piscina?','Do you know if this place has a pool?','Piscina','Pool','Sin piscina','No pool','Waves'],
 breakfast:['¿Sabe si este lugar incluye el desayuno?','Do you know if breakfast is included here?','Desayuno incluido','Breakfast included','Desayuno no incluido','Breakfast not included','Coffee'],
 byAppointment:['¿Sabe si este lugar atiende con cita previa?','Do you know if this place works by appointment?','Con cita previa','By appointment','Sin cita previa','Walk-in','CalendarClock'],
};
export const attrQuestionText=(key:string,en:boolean)=>T[key]?.[en?1:0]??'';
export const attrValueText=(key:string,value:boolean,en:boolean)=>T[key]?.[value?(en?3:2):(en?5:4)]??'';
export const attrIcon=(key:string)=>T[key]?.[6]??'Check';
/** Whether the place's own attributes already settle the key (same rule as dir_attr_known). */
export function attrKnown(attributes:Record<string,unknown>,key:string):boolean{
 return key==='sinpe'?Array.isArray(attributes.paymentMethods):typeof attributes[key]==='boolean';
}
export type AttrState={confirmed:Record<string,boolean>;answered:string[]};
/** The next key to ask this person: in section order, not settled by the place, not confirmed, not answered yet. */
export function nextAttrQuestion(vertical:string,attributes:Record<string,unknown>,state:AttrState|null,skip:string[]=[]):string|null{
 for(const k of ATTR_QUESTION_KEYS[vertical]??[]){
  if(attrKnown(attributes,k)||(state&&k in state.confirmed)||state?.answered.includes(k)||skip.includes(k))continue;
  return k;
 }
 return null;
}
