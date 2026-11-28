// Contacts: client custom fields and their values, extra e-mail channels (example.com only, no phones), client tags,
// and company vendors/subcontractors (Collaborators › Vendors, over the Expenses suppliers). Same RPCs as
// /api/pro/client-contacts(/fields) and /api/pro/company-vendors; deterministic action ids, skipped when their receipt
// exists. None of these writers enqueues notifications or e-mail.
import {uuid,must,crDate} from '../lib.mjs';

const FIELDS=[
 ['como','Cómo nos conoció (Ejemplo)','select',['Recomendación','Redes sociales','Sitio web','Feria','Rótulo en obra']],
 ['presupuesto','Presupuesto estimado en colones (Ejemplo)','number',[]],
 ['inicio','Fecha preferida de inicio (Ejemplo)','date',[]],
 ['horario','Horario preferido para visitas (Ejemplo)','text',[]],
];
// client: [como,presupuesto,inicio day,horario,extra e-mail [value,label]|null,tags]
const VALUES={
 c1:['Recomendación','6500000',-25,'Entre semana de 8 a. m. a 11 a. m.',['facturacion.c1.ejemplo@example.com','Facturación'],['Residencial','Cliente recurrente']],
 c2:['Redes sociales','4500000',-8,'Sábados por la mañana',null,['Residencial','Referido']],
 c3:['Sitio web','9000000',10,'Después de las 6 p. m.',['administracion.c3.ejemplo@example.com','Administración'],['Comercial','Fuera de horario']],
 c4:['Feria','12000000',-55,'Coordinar con la administración',['junta.c4.ejemplo@example.com','Junta directiva'],['Condominios','Contrato anual']],
 c5:['Rótulo en obra','60000000',-35,'Cualquier día',null,['Residencial','Obra nueva']],
 c6:['Sitio web','2800000',20,'Martes y jueves por la tarde',null,['Residencial']],
 c7:['Recomendación','8500000',25,'Lunes antes de abrir la clínica',['gerencia.c7.ejemplo@example.com','Gerencia'],['Comercial','Salud']],
};
const VENDORS=[
 ['ferreteria','Ferretería El Constructor (Ejemplo)','supplier','Materiales de construcción','Sofía Herrera (Ejemplo)','La Uruca, San José','Entrega en obra los martes y viernes. Crédito a 30 días.'],
 ['porcelanatos','Porcelanatos del Valle (Ejemplo)','supplier','Pisos y enchapes','Daniel Castro (Ejemplo)','Curridabat, San José','Pedidos con 5 días de anticipación.'],
 ['maderas','Maderas Tratadas San Carlos (Ejemplo)','supplier','Madera y pérgolas','Paola Méndez (Ejemplo)','Ciudad Quesada, Alajuela',null],
 ['electricos','Instalaciones Eléctricas Brenes (Ejemplo)','subcontractor','Electricidad','Luis Brenes (Ejemplo)','Cartago centro','Electricista con incorporación al CFIA (dato ficticio).'],
 ['fontaneria','Fontanería Rápida Heredia (Ejemplo)','subcontractor','Fontanería','Karla Jiménez (Ejemplo)','San Pablo, Heredia',null],
 ['gypsum','Acabados en Gypsum Ramírez (Ejemplo)','subcontractor','Cielos y divisiones','Esteban Ramírez (Ejemplo)','Alajuela centro','Equipo de 4 personas; disponible fines de semana.'],
];

export async function seed(ctx){
 const {db,apply,anchor,owner,log}=ctx;
 const rpc=(name,args)=>must(name,db.rpc(name,args));
 const has=async(table,aid)=>!!(await must(table,db.from(table).select('action_id').eq('owner_id',owner).eq('action_id',aid).limit(1))).length;
 let made=0,kept=0;
 const once=async(table,aid,run)=>{if(await has(table,aid)){kept++;return;}if(apply){await run();made++;}};
 const counts={contactFields:0,contactFieldValues:0,contactChannels:0,contactTags:0,vendors:0};

 // 1. Custom field definitions (each save bumps the field catalogue revision, read fresh before every write).
 for(const [key,label,kind,options] of FIELDS){
  const aid=uuid(`contacts:field:${key}`);
  await once('pro_contact_field_actions',aid,async()=>{const {revision}=await rpc('pro_contact_fields_read',{p_owner:owner});
   await rpc('pro_contact_fields_mutate',{p_owner:owner,p_input:{action:'field_save',actionId:aid,revision,id:uuid(`contacts:field:${key}:id`),label,kind,options},p_member:null});});
  counts.contactFields++;
 }
 // 2. Values and extra e-mail per client, then the client's tags.
 for(const [client,[como,presupuesto,day,horario,mail,tags]] of Object.entries(VALUES)){
  const clientId=`ejemplo-${client}`,values={[uuid('contacts:field:como:id')]:como,[uuid('contacts:field:presupuesto:id')]:presupuesto,[uuid('contacts:field:inicio:id')]:crDate(anchor,day),[uuid('contacts:field:horario:id')]:horario};
  const aid=uuid(`contacts:extras:${client}`);
  await once('pro_contact_field_actions',aid,async()=>{const {revision}=await rpc('pro_contact_extras_read',{p_owner:owner,p_client:clientId});
   await rpc('pro_contact_fields_mutate',{p_owner:owner,p_input:{action:'extras_save',actionId:aid,revision,clientId,values,channels:mail?[{kind:'email',value:mail[0],label:mail[1]}]:[]},p_member:null});});
  counts.contactFieldValues+=Object.keys(values).length;if(mail)counts.contactChannels++;
  const tid=uuid(`contacts:tags:${client}`);
  await once('pro_contact_actions',tid,()=>rpc('pro_contacts_mutate',{p_owner:owner,p_input:{action:'tags',actionId:tid,clientId,tags}}));
  counts.contactTags+=tags.length;
 }
 // 3. Company vendors and subcontractors (no phone; e-mail on example.com).
 for(const [key,name,kind,trade,contactName,address,notes] of VENDORS){
  const aid=uuid(`contacts:vendor:${key}`);
  await once('pro_company_vendor_actions',aid,()=>rpc('pro_company_vendors_mutate',{p_actor:owner,p_input:{action:'create',actionId:aid,id:uuid(`contacts:vendor:${key}:id`),
   name,kind,trade,contactName,email:`${key}.ejemplo@example.com`,phone:'',identification:'',notes,address}}));
  counts.vendors++;
 }
 Object.assign(ctx.counts,counts);
 log('contacts',apply?`${made} writes, ${kept} already present`:`dry run: ${kept} steps already present, the rest would be written`);
}
