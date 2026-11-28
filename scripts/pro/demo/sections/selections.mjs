// Selections (project p1, Familia Rojas Vargas): allowances, selection areas/items/options, room budget, internal
// cost per option and tracking reference. Same writers as /api/pro/allowances, /selections, /selection-boards and
// /selections-tracking. Customer decisions (approve / request changes) and order status other than «Sin pedir» need
// a linked customer account (pro_work_selections_client_mutate), so they are not seeded. Nothing here notifies anyone.
import {uuid,tid,must,crDate,appModules} from '../lib.mjs';

const C=colones=>Math.round(colones*100);
const WORK=tid('p1');
const ALLOWANCES=[
 {key:'muebles',name:'Muebles de cocina (Ejemplo)',category:'Cocina',planned:1850000,due:5,notes:'Incluye bisagras de cierre lento y jaladeras.'},
 {key:'sobre',name:'Sobre de cocina (Ejemplo)',category:'Cocina',planned:980000,due:-3,notes:'3,2 m lineales con salpicadero de 10 cm.',
  decide:{choiceDescription:'Cuarzo blanco nube 3,2 m con salpicadero',supplier:'Proveedor de superficies (Ejemplo)',quantity:1,actual:1045000}},
 {key:'enchape',name:'Enchape de baño principal (Ejemplo)',category:'Baño',planned:396000,due:10,notes:'18 m² de paredes y piso de ducha.'},
 {key:'griferia',name:'Grifería de baño (Ejemplo)',category:'Baño',planned:250000,due:12,notes:null},
];
const AREAS=[
 {key:'cocina',name:'Cocina',budget:3300000,assignee:'Carlos Méndez (Ejemplo)',items:[
  {key:'sobre',name:'Sobre de cocina (Ejemplo)',allowance:'sobre',due:-3,publish:true,recommend:0,notes:'Confirmar medidas finales con el fabricante.',options:[
   ['Cuarzo blanco nube','Proveedor de superficies (Ejemplo)',1,1045000,'Recomendado por su resistencia a manchas y su fácil limpieza.'],
   ['Granito gris perla','Proveedor de superficies (Ejemplo)',1,890000,'Requiere sellado una vez al año.'],
   ['Porcelánico de gran formato','Distribuidora de acabados (Ejemplo)',1,760000,null]]},
  {key:'muebles',name:'Muebles de cocina (Ejemplo)',allowance:'muebles',due:5,publish:true,recommend:0,notes:null,options:[
   ['Melamina roble claro','Taller de muebles (Ejemplo)',1,1850000,'Puertas con cierre lento incluidas.'],
   ['Melamina blanco mate','Taller de muebles (Ejemplo)',1,1720000,'Acabado mate, fácil de combinar con el cuarzo.']]},
  {key:'fregadero',name:'Fregadero (Ejemplo)',allowance:null,due:8,publish:false,recommend:null,notes:'Pendiente de revisar con la familia antes de publicarlo.',options:[
   ['Fregadero doble de acero inoxidable','Ferretería de materiales (Ejemplo)',1,145000,null],
   ['Fregadero de granito negro','Distribuidora de acabados (Ejemplo)',1,235000,null]]},
 ]},
 {key:'bano',name:'Baño principal',budget:1200000,assignee:'Carlos Méndez (Ejemplo)',items:[
  {key:'enchape',name:'Enchape de paredes (Ejemplo)',allowance:'enchape',due:10,publish:true,recommend:0,notes:'Cantidad calculada con 10 % de desperdicio.',options:[
   ['Porcelanato 30×60 blanco','Distribuidora de acabados (Ejemplo)',18,22000,'Superficie mate, antideslizante en el piso de la ducha.'],
   ['Cerámica 25×40 gris claro','Ferretería de materiales (Ejemplo)',18,14500,null],
   ['Porcelanato tipo mármol 60×120','Distribuidora de acabados (Ejemplo)',18,31000,'Requiere menos juntas; instalación más lenta.']]},
  {key:'griferia',name:'Grifería de lavamanos y ducha (Ejemplo)',allowance:'griferia',due:12,publish:true,recommend:null,notes:null,options:[
   ['Juego monomando cromado','Ferretería de materiales (Ejemplo)',1,168000,null],
   ['Juego monomando negro mate','Distribuidora de acabados (Ejemplo)',1,214000,'Combina con los accesorios negros que usted eligió.']]},
 ]},
];
const k=(...p)=>uuid(['selections','p1',...p].join(':'));

export async function seed(ctx){
 const {db,apply,anchor,owner,log}=ctx,S='selections';
 const items=AREAS.flatMap(a=>a.items),options=items.flatMap(i=>i.options);
 if(!apply){
  Object.assign(ctx.counts,{selection_allowances:ALLOWANCES.length,selection_allowances_decided:ALLOWANCES.filter(a=>a.decide).length,selection_areas:AREAS.length,selection_items:items.length,
   selection_options:options.length,selection_published:items.filter(i=>i.publish).length,selection_room_meta:AREAS.length,selection_option_costs:options.length,selection_tracking:items.filter(i=>i.publish).length});
  log(S,'dry run: would seed allowances, 2 areas, items, options, costs and tracking for ejemplo-p1');return;
 }
 const app=appModules("export {selectionMutationSchema} from './src/lib/pro/selections';export {allowanceMutationSchema} from './src/lib/pro/allowances';export {roomMetaMutationSchema} from './src/lib/pro/selection-boards';export {selectionTrackingInputSchema} from './src/lib/pro/round10';");
 const row=(table,id,key='id')=>must(table,db.from(table).select('*').eq('owner_id',owner).eq(key,id).maybeSingle());
 const sel=input=>must(`selections ${input.action}`,db.rpc('pro_work_selections_mutate',{p_actor:owner,p_input:app.selectionMutationSchema.parse(input)}));
 const allow=input=>must(`allowances ${input.action}`,db.rpc('pro_work_allowances_mutate',{p_actor:owner,p_input:app.allowanceMutationSchema.parse(input)}));
 const track=input=>must(`tracking ${input.action}`,db.rpc('pro_work_selection_tracking_mutate',{p_owner:owner,p_input:app.selectionTrackingInputSchema.parse(input)}));
 let writes=0;
 // 1. Allowances (an item links to its allowance, so these go first).
 for(const a of ALLOWANCES){
  const id=k('allowance',a.key);let cur=await row('pro_work_allowances',id);
  if(!cur){await allow({action:'create',actionId:k('allowance',a.key,'create'),workId:WORK,id,name:a.name,category:a.category,plannedCents:C(a.planned),dueDate:crDate(anchor,a.due),notes:a.notes});writes++;cur=await row('pro_work_allowances',id);}
  if(a.decide&&cur.status==='decided'&&cur.choice_supplier!==a.decide.supplier){ // realign an earlier seed version
   await allow({action:'reopen',actionId:k('allowance',a.key,'reopen',cur.choice_supplier),workId:WORK,id,revision:cur.revision});writes++;cur=await row('pro_work_allowances',id);}
  if(a.decide&&cur.status!=='decided'){await allow({action:'decide',actionId:k('allowance',a.key,'decide',a.decide.supplier),workId:WORK,id,revision:cur.revision,choiceDescription:a.decide.choiceDescription,supplier:a.decide.supplier,quantity:a.decide.quantity,actualCents:C(a.decide.actual)});writes++;}
 }
 // 2. Areas, items, options, recommendation and publication (visible to a linked customer only; none exists).
 for(const area of AREAS){
  const areaId=k('area',area.key);
  if(!await row('pro_work_selection_areas',areaId)){await sel({action:'area_create',actionId:k('area',area.key,'create'),workId:WORK,id:areaId,name:area.name});writes++;}
  for(const it of area.items){
   const id=k('item',it.key);
   if(!await row('pro_work_selection_items',id)){await sel({action:'item_create',actionId:k('item',it.key,'create'),workId:WORK,id,areaId,name:it.name,dueDate:crDate(anchor,it.due),notes:it.notes,allowanceId:it.allowance?k('allowance',it.allowance):null});writes++;}
   for(const [n,[name,brand,quantity,unit,clientNotes]] of it.options.entries()){
    const optionId=k('item',it.key,'option',n),fields={optionId,name:`${name} (Ejemplo)`,brand,url:null,quantity,unitCents:C(unit),clientNotes,imageFileId:null};
    const existing=await row('pro_work_selection_options',optionId),cur=await row('pro_work_selection_items',id);
    if(!existing){await sel({action:'option_add',actionId:k('item',it.key,'option',n,'add'),workId:WORK,id,revision:cur.revision,...fields});writes++;}
    // Text drift from an earlier seed version: realign through option_update (action id bound to the new text).
    else if(existing.name!==fields.name||existing.brand!==brand||existing.client_notes!==clientNotes){await sel({action:'option_update',actionId:k('item',it.key,'option',n,'update',fields.name,brand,clientNotes??''),workId:WORK,id,revision:cur.revision,...fields});writes++;}
   }
   let cur=await row('pro_work_selection_items',id);
   if(it.recommend!==null&&!cur.recommended_option_id){await sel({action:'recommend',actionId:k('item',it.key,'recommend'),workId:WORK,id,revision:cur.revision,optionId:k('item',it.key,'option',it.recommend)});writes++;cur=await row('pro_work_selection_items',id);}
   if(it.publish&&!cur.published){await sel({action:'publish',actionId:k('item',it.key,'publish'),workId:WORK,id,revision:cur.revision});writes++;}
  }
  // 3. Room budget and assignee (selection boards).
  if(!await row('pro_work_selection_area_meta',areaId,'area_id')){
   await must('room meta',db.rpc('pro_work_selection_meta_set',{p_owner:owner,p_input:app.roomMetaMutationSchema.parse({areaId,revision:0,budgetCents:C(area.budget),assignee:area.assignee})}));writes++;
  }
 }
 // 4. Internal cost per option (about 78 % of the price) and supplier reference on published items («Sin pedir»).
 for(const it of items){
  for(const [n,[, ,,unit]] of it.options.entries()){
   const optionId=k('item',it.key,'option',n);if(await row('pro_work_selection_option_costs',optionId,'option_id'))continue;
   await track({action:'cost_set',actionId:k('item',it.key,'option',n,'cost'),workId:WORK,optionId,revision:0,unitCostCents:C(Math.round(unit*0.78/100)*100)});writes++;
  }
  if(it.publish&&!await row('pro_work_selection_tracking',k('item',it.key),'item_id')){
   await track({action:'tracking_set',actionId:k('item',it.key,'tracking'),workId:WORK,itemId:k('item',it.key),revision:0,status:'not_ordered',orderedOn:null,deliveredOn:null,supplierRef:`Cotización ${it.key.toUpperCase()}-2026 (Ejemplo)`});writes++;
  }
 }
 const count=async(table,extra=q=>q)=>{const {count:n,error}=await extra(db.from(table).select('*',{count:'exact',head:true}).eq('owner_id',owner));if(error)throw new Error(`${table}: ${error.message}`);return n;};
 const w=q=>q.eq('work_id',WORK);
 Object.assign(ctx.counts,{selection_allowances:await count('pro_work_allowances',w),selection_allowances_decided:await count('pro_work_allowances',q=>w(q).eq('status','decided')),
  selection_areas:await count('pro_work_selection_areas',w),selection_items:await count('pro_work_selection_items',w),selection_options:await count('pro_work_selection_options',w),
  selection_published:await count('pro_work_selection_items',q=>w(q).eq('published',true)),selection_room_meta:await count('pro_work_selection_area_meta'),
  selection_option_costs:await count('pro_work_selection_option_costs'),selection_tracking:await count('pro_work_selection_tracking',w)});
 log(S,`${writes} writes`);
}
