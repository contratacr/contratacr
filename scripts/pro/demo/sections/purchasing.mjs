// Purchasing: company vendors (suppliers/subcontractors), catalogue extras (preferred vendor, specs incl. brand,
// price book), product categories (catalog organizations), purchase orders for p1/p5 and bid packages.
// Same writers as /api/pro/{company-vendors,catalog-details,catalog-specs,catalog-pricing,catalog-organizations,
// purchase-orders,purchase-order-tracking,bids}. Nothing is sent to any vendor: no portal links, no e-mail.
import {must,uuid,tid,crDate,appModules} from '../lib.mjs';

const S='purchasing';
const VENDORS=[
 {key:'v1',name:'Ferretería y Pinturas Santa Ana (Ejemplo)',kind:'supplier',trade:'Ferretería',contactName:'Luis Campos (Ejemplo)',address:'Desamparados centro, San José'},
 {key:'v2',name:'Materiales y Agregados Las Palmas (Ejemplo)',kind:'supplier',trade:'Materiales de construcción',contactName:'Ana Lucía Méndez (Ejemplo)',address:'Barrio San José, Alajuela'},
 {key:'v3',name:'Cerámicas Ochomogo (Ejemplo)',kind:'supplier',trade:'Pisos y enchapes',contactName:'Carlos Arias (Ejemplo)',address:'Curridabat, San José'},
 {key:'v4',name:'Electro Suministros Heredia (Ejemplo)',kind:'supplier',trade:'Electricidad',contactName:'Gabriela Mora (Ejemplo)',address:'San Francisco, Heredia'},
 {key:'v5',name:'Hidráulica Solano e Hijos (Ejemplo)',kind:'subcontractor',trade:'Fontanería',contactName:'José Solano (Ejemplo)',address:'Tres Ríos, Cartago'},
];
// product key -> [vendor, cost type, msrp (colones), favorite]
const PRICING={cemento:['v2','material',7900,true],varilla:['v2','material',3700,false],block:['v2','material',750,false],porcelanato:['v3','material',21500,true],
 pintura:['v1','material',16900,false],tubo:['v1','material',2300,false],cable:['v4','material',44500,false],luminaria:['v4','material',10900,true],
 'srv-visita':[null,'labor',null,false],'srv-diseno':[null,'labor',null,false],'srv-hora':[null,'labor',null,true]};
const SPECS={
 porcelanato:{brand:'Cerámica Andina (Ejemplo)',model:'Beige Mate 60',finish:'Mate',color:'Beige',material:'Porcelanato',dimensions:'60 × 60 cm, 9 mm de espesor',warranty:'10 años contra defectos de fábrica'},
 pintura:{brand:'Pinturas Tropical (Ejemplo)',model:'Acrílica Interior Plus',finish:'Mate',color:'Blanco hueso',material:'Acrílica base agua',dimensions:'Galón de 3,78 L',warranty:'5 años en interiores'},
 luminaria:{brand:'LuzCR (Ejemplo)',model:'PL-18 redondo',finish:'Aluminio blanco',color:'Luz fría 6500 K',material:'Aluminio y policarbonato',dimensions:'22,5 cm de diámetro',warranty:'2 años'},
 cable:{brand:'Conductores del Valle (Ejemplo)',model:'THHN #12 AWG',finish:null,color:'Negro',material:'Cobre',dimensions:'Rollo de 100 m',warranty:null},
 cemento:{brand:'Cementos del Istmo (Ejemplo)',model:'Uso general UG',finish:null,color:'Gris',material:'Cemento hidráulico',dimensions:'Saco de 50 kg',warranty:null},
};
const CATEGORIES=['Materiales','Acabados','Fontanería','Electricidad','Servicios','Mano de obra'];
const pid=key=>tid(key.startsWith('srv-')?key:`prod-${key}`);
const line=(po,n,description,quantity,unit,colones)=>({id:uuid(`${S}:po:${po}:line:${n}`),description,quantity,unit,unitCents:colones*100,taxRate:13,budgetCodeId:null,selectionOptionId:null,allowanceId:null});
const ORDERS=a=>[
 {key:'po1',work:'p1',vendor:'v3',title:'Porcelanato y materiales de baño (Ejemplo)',issue:crDate(a,-19),expected:crDate(a,-14),notes:'Entregar en obra entre 8:00 y 15:00. Datos ficticios de ejemplo.',
  lines:[line('po1',1,'Porcelanato 60×60 beige','20','m²',14500),line('po1',2,'Pegamento para porcelanato, saco 20 kg','8','saco',6900),line('po1',3,'Fragua sin arena, bolsa 2 kg','4','bolsa',3200)],
  steps:['issue',{receive:'all',on:crDate(a,-14),note:'Recibido completo en obra (Ejemplo).'},{pay:'all',on:crDate(a,-12),method:'transfer',reference:'TRF-EJEMPLO-0001'}]},
 {key:'po2',work:'p5',vendor:'v2',title:'Materiales de obra gris, etapa 2 (Ejemplo)',issue:crDate(a,-8),expected:crDate(a,4),notes:'Entrega en dos viajes. Datos ficticios de ejemplo.',
  lines:[line('po2',1,'Cemento gris 50 kg','80','saco',5600),line('po2',2,'Varilla corrugada #3','150','unidad',2650),line('po2',3,'Block de concreto 15 cm','600','unidad',520)],
  steps:['issue',{receive:[[1,'40']],on:crDate(a,-5),note:'Primer viaje: 40 sacos de cemento (Ejemplo).'},{pay:'half',on:crDate(a,-6),method:'sinpe',reference:'SINPE-EJEMPLO-2045'}],
  tracking:{carrier:'Transporte del proveedor (Ejemplo)',trackingNumber:'GUIA-EJ-2045',shippedOn:crDate(a,-5),etaOn:crDate(a,2),installOn:null,note:'Segundo viaje programado; confirmar acceso del camión (Ejemplo).'}},
 {key:'po3',work:'p5',vendor:'v4',title:'Material eléctrico para casa (Ejemplo)',issue:crDate(a,-6),expected:crDate(a,10),notes:'Borrador pendiente de revisar cantidades. Datos ficticios de ejemplo.',
  lines:[line('po3',1,'Cable THHN #12, rollo','6','rollo',32500),line('po3',2,'Panel LED 18 W','14','unidad',6900)],steps:[]},
];
// Offers cannot predate the package (created now), so they are dated today in Costa Rica.
const TODAY=()=>new Date(Date.now()-6*3600000).toISOString().slice(0,10);
const BIDS=a=>[
 {key:'b1',work:'p5',title:'Suministro de materiales, etapa 3 (Ejemplo)',scope:'Cotización de materiales de obra gris para la tercera etapa de la casa. Precios sin transporte. Datos ficticios de ejemplo.',due:crDate(a,7),
  lines:[['Cemento gris 50 kg','100','saco'],['Varilla corrugada #3','200','unidad'],['Block de concreto 15 cm','800','unidad']],invite:['v1','v2'],
  responses:[{vendor:'v1',on:TODAY(),lead:5,valid:crDate(a,20),notes:'Incluye descarga en obra (Ejemplo).',prices:[5900,2750,560]},
   {vendor:'v2',on:TODAY(),lead:3,valid:crDate(a,25),notes:'Precio especial por volumen (Ejemplo).',prices:[5550,2690,540]}],close:true,award:'v2'},
 {key:'b2',work:'p1',title:'Mueble de cocina en melamina (Ejemplo)',scope:'Muebles altos y bajos en melamina blanca con herrajes de cierre suave. Datos ficticios de ejemplo.',due:crDate(a,12),
  lines:[['Mueble bajo con sobre preparado','3,2','m'],['Mueble alto','2,8','m'],['Instalación','1','servicio']],invite:['v1'],responses:[]},
];

export async function seed(ctx){
 const {db,apply,anchor,owner,log}=ctx;
 const app=appModules(`export {companyVendorMutationSchema} from './src/lib/pro/company-vendors';export {productDetailMutationSchema} from './src/lib/pro/catalog-details';
export {productSpecsMutationSchema} from './src/lib/pro/catalog-specs';export {productPricingMutationSchema} from './src/lib/pro/catalog-pricing';
export {organizationMutationSchema} from './src/lib/pro/catalog-organizations';export {purchaseOrderMutationSchema} from './src/lib/pro/purchase-orders';export {bidMutationSchema} from './src/lib/pro/bids';`);
 const one=async(table,filters)=>{let q=db.from(table).select('*');for(const [k,v] of Object.entries(filters))q=q.eq(k,v);return must(table,q.maybeSingle());};
 // Counts cover only this section's deterministic rows (other sections write to the same tables concurrently).
 // Dry run reports the intended totals; apply reports this section's rows in the database.
 const count=async(table,col,key,list,intended=list.length)=>{if(!apply)return intended;const {count:n,error}=await db.from(table).select('*',{count:'exact',head:true}).eq(col,owner).in(key,list);if(error)throw new Error(`${table}: ${error.message}`);return n;};
 const done=async(table,aid)=>!!await one(table,{actor_id:owner,action_id:aid});
 let writes=0;
 const rpc=async(fn,args)=>{writes++;return must(fn,db.rpc(fn,args));};
 const vendorId=k=>uuid(`${S}:vendor:${k}`);
 const ids=Object.keys(PRICING);

 // 1. Company vendors (Empresa › Proveedores; also the PO/bid supplier list).
 for(const v of VENDORS){
  const id=vendorId(v.key);if(await one('pro_expense_suppliers',{user_id:owner,id}))continue;if(!apply){writes++;continue;}
  await rpc('pro_company_vendors_mutate',{p_actor:owner,p_input:app.companyVendorMutationSchema.parse({action:'create',actionId:uuid(`${S}:vendor:${v.key}:create`),id,name:v.name,kind:v.kind,trade:v.trade,
   contactName:v.contactName,email:`${v.key}.proveedor@example.com`,phone:'',identification:'',notes:'Proveedor ficticio de ejemplo. No se le envía nada.',address:v.address})});
 }
 // 2. Catalogue extras: preferred vendor, specifications (brand/model…) and price book (cost type, MSRP, favorite).
 for(const key of ids){
  const productId=pid(key),[vendor,costType,msrp,favorite]=PRICING[key];
  if(vendor){const row=await one('pro_product_details',{user_id:owner,product_id:productId});
   if(row?.preferred_vendor_id!==vendorId(vendor)){if(apply)await rpc('pro_product_details_mutate',{p_user:owner,p_input:app.productDetailMutationSchema.parse({action:'set_vendor',actionId:uuid(`${S}:detail:${key}`),productId,revision:row?.revision??0,vendorId:vendorId(vendor)})});else writes++;}}
  if(SPECS[key]&&!await one('pro_product_specs',{owner_id:owner,product_id:productId})){if(apply)await rpc('pro_product_specs_set',{p_actor:owner,p_input:app.productSpecsMutationSchema.parse({productId,revision:0,...SPECS[key]})});else writes++;}
  if(!await one('pro_product_pricing',{owner_id:owner,product_id:productId})){if(apply)await rpc('pro_product_pricing_set',{p_actor:owner,p_input:app.productPricingMutationSchema.parse({productId,revision:0,costType,msrpCents:msrp===null?null:msrp*100,url:null,favorite})});else writes++;}
 }
 // 3. Product categories (catalog organizations, kind product_category) matching core's item categories.
 // Client groups (kind client_group) are left to the contacts section.
 for(const name of CATEGORIES){
  const id=uuid(`${S}:category:${name}`);
  if(await one('pro_catalog_organizations',{user_id:owner,kind:'product_category',id}))continue;
  const {data:alias}=await db.from('pro_catalog_organization_aliases').select('organization_id').eq('user_id',owner).eq('kind','product_category').ilike('name',name).limit(1);
  if(alias?.length)continue;if(!apply){writes++;continue;}
  const rev=(await one('pro_catalog_organization_revisions',{user_id:owner,kind:'product_category'}))?.revision??0;
  const body=app.organizationMutationSchema.parse({kind:'product_category',action:'create',id,revision:rev,name});
  await rpc('pro_mutate_catalog_organization',{p_user:owner,p_kind:body.kind,p_action:body.action,p_id:body.id,p_name:body.name,p_revision:body.revision});
 }
 // 4. Purchase orders: create → issue → receive → pay (manual records), plus shipment tracking. Never sent to vendors.
 for(const o of ORDERS(anchor)){
  const id=uuid(`${S}:po:${o.key}`),base={workId:tid(o.work),id};
  const order=()=>one('pro_purchase_orders',{owner_id:owner,id});
  const step=async(name,build)=>{const aid=uuid(`${S}:po:${o.key}:${name}`);if(await done('pro_purchase_order_actions',aid))return;if(!apply){writes++;return;}
   const cur=await order();await rpc('pro_purchase_orders_mutate',{p_actor:owner,p_input:app.purchaseOrderMutationSchema.parse({...build(cur),actionId:aid,...base})});};
  await step('create',()=>({action:'create',supplierId:vendorId(o.vendor),supplierName:null,supplierContact:null,title:o.title,issueDate:o.issue,expectedDate:o.expected,notes:o.notes,
   lines:o.lines.map(l=>({...l,quantity:Number(l.quantity)}))}));
  if(!apply&&!await order())continue;
  for(const s of o.steps){
   if(s==='issue')await step('issue',cur=>({action:'issue',revision:cur.revision}));
   else if(s.receive)await step('receive',cur=>({action:'receive',revision:cur.revision,receivedOn:s.on,note:s.note,
    entries:s.receive==='all'?o.lines.map(l=>({lineId:l.id,quantity:Number(l.quantity)})):s.receive.map(([n,q])=>({lineId:o.lines[n-1].id,quantity:Number(q)}))}));
   else if(s.pay)await step('pay',cur=>{const total=o.lines.reduce((t,l)=>{const sub=Math.round(Number(l.quantity)*l.unitCents);return t+sub+Math.round(sub*0.13);},0);
    return {action:'pay',revision:cur.revision,amountCents:s.pay==='all'?total:Math.round(total/2),paidOn:s.on,method:s.method,reference:s.reference,note:'Pago registrado manualmente (Ejemplo).'};});
  }
  if(o.tracking&&!await one('pro_purchase_order_tracking',{owner_id:owner,order_id:id})){
   if(!apply){writes++;continue;}
   await rpc('pro_purchase_order_tracking_set',{p_actor:owner,p_input:{...base,revision:0,...o.tracking,lineStates:{}}});
  }
 }
 // 5. Bid packages: create → invite (directory record only, no e-mail/portal) → open → offers typed in by hand → close → award.
 for(const b of BIDS(anchor)){
  const id=uuid(`${S}:bid:${b.key}`),lineIds=b.lines.map((_,i)=>uuid(`${S}:bid:${b.key}:line:${i+1}`));
  const step=async(name,build)=>{const aid=uuid(`${S}:bid:${b.key}:${name}`);if(await done('pro_bid_actions',aid))return;if(!apply){writes++;return;}
   const cur=await one('pro_bid_packages',{owner_id:owner,id});
   await rpc('pro_bids_mutate',{p_actor:owner,p_input:app.bidMutationSchema.parse({...build(cur),actionId:aid,workId:tid(b.work),id,...(cur?{revision:cur.revision}:{})})});};
  await step('create',()=>({action:'create',title:b.title,scope:b.scope,dueDate:b.due,lines:b.lines.map(([description,q,unit],i)=>({id:lineIds[i],description,quantity:Number(q.replace(',','.')),unit,budgetCodeId:null}))}));
  if(!apply&&!await one('pro_bid_packages',{owner_id:owner,id}))continue;
  await step('invite',()=>({action:'invite',supplierIds:b.invite.map(vendorId)}));
  if(!b.responses.length)continue;
  await step('open',()=>({action:'open'}));
  for(const r of b.responses)await step(`response:${r.vendor}`,()=>({action:'record_response',supplierId:vendorId(r.vendor),receivedOn:r.on,leadDays:r.lead,validUntil:r.valid,notes:r.notes,
   prices:r.prices.map((p,i)=>({lineId:lineIds[i],unitCents:p*100}))}));
  if(b.close)await step('close',()=>({action:'close'}));
  if(b.award)await step('award',()=>({action:'award',awards:lineIds.map(lineId=>({lineId,supplierId:vendorId(b.award)}))}));
 }
 const c=ctx.counts,products=ids.map(pid),orders=ORDERS(anchor).map(o=>uuid(`${S}:po:${o.key}`)),bids=BIDS(anchor).map(b=>uuid(`${S}:bid:${b.key}`));
 c.vendors=await count('pro_expense_suppliers','user_id','id',VENDORS.map(v=>vendorId(v.key)));c.productDetails=await count('pro_product_details','user_id','product_id',products,ids.filter(k=>PRICING[k][0]).length);
 c.productSpecs=await count('pro_product_specs','owner_id','product_id',products,Object.keys(SPECS).length);c.productPricing=await count('pro_product_pricing','owner_id','product_id',products);
 c.productCategories=await count('pro_catalog_organizations','user_id','id',CATEGORIES.map(n=>uuid(`${S}:category:${n}`)));
 c.purchaseOrders=await count('pro_purchase_orders','owner_id','id',orders);c.poTracking=await count('pro_purchase_order_tracking','owner_id','order_id',orders,ORDERS(anchor).filter(o=>o.tracking).length);
 c.bidPackages=await count('pro_bid_packages','owner_id','id',bids);c.bidResponses=await count('pro_bid_responses','owner_id','package_id',bids,BIDS(anchor).reduce((t,b)=>t+b.responses.length,0));
 log(S,apply?`${writes} writes`:`dry run: ${writes} writes pending`);
}
