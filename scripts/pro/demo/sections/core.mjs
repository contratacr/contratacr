// Core: demo account (fictitious), active Pro grant and the workspace document (clients, projects/work,
// catalogue items, quotes, inventory movements, availability). Everything is marked «Ejemplo».
import {DEMO_EMAIL,DEMO_NAME,must,tid,crTime,crDate,appModules} from '../lib.mjs';

export const CLIENTS=[
 {key:'c1',name:'Familia Rojas Vargas (Ejemplo)',group:'Residencial',address:'Barrio Los Ángeles, San Rafael de Escazú, San José',notes:'Remodelación de cocina y baño principal. Prefiere visitas por la mañana.'},
 {key:'c2',name:'Mariana Solís Chaves (Ejemplo)',group:'Residencial',address:'Residencial Lomas de Ayarco, Curridabat, San José',notes:'Ampliación de terraza techada.'},
 {key:'c3',name:'Café La Montaña S.A. (Ejemplo)',tradeName:'Café La Montaña',group:'Comercial',address:'Avenida Central, Heredia centro',notes:'Local comercial; trabajos fuera de horario de atención.'},
 {key:'c4',name:'Condominio Vista Real (Ejemplo)',group:'Condominios',address:'Santa Ana, Pozos, San José',notes:'Mantenimiento de áreas comunes. Contacto por administración.'},
 {key:'c5',name:'Andrés Mora Jiménez (Ejemplo)',group:'Residencial',address:'San Isidro de Grecia, Alajuela',notes:'Casa nueva de 140 m².'},
 {key:'c6',name:'Laura Quesada Brenes (Ejemplo)',group:'Residencial',address:'Tres Ríos, La Unión, Cartago',notes:'Cambio de pisos y pintura interior.'},
 {key:'c7',name:'Clínica Dental Sonrisa (Ejemplo)',tradeName:'Clínica Sonrisa',group:'Comercial',address:'Plaza Lincoln, Moravia, San José',notes:'Adecuación de consultorio.'},
 {key:'c8',name:'Roberto Alfaro Ureña (Ejemplo)',group:'Residencial',address:'Atenas centro, Alajuela',notes:'Cliente archivado: proyecto terminado en 2025.',archived:true},
];
// Projects (workspace «work» rows): the Projects hub, agenda and each project's sections key on these ids.
export const PROJECTS=[
 {key:'p1',client:'c1',service:'Remodelación de cocina y baño (Ejemplo)',stage:'scheduled',day:-20,len:45,quote:'q1'},
 {key:'p2',client:'c2',service:'Terraza techada de 32 m² (Ejemplo)',stage:'scheduled',day:-6,len:30,quote:'q2'},
 {key:'p3',client:'c3',service:'Adecuación de local comercial (Ejemplo)',stage:'quoting',day:8,len:20},
 {key:'p4',client:'c4',service:'Mantenimiento de áreas comunes (Ejemplo)',stage:'completed',day:-60,len:15,quote:'q4'},
 {key:'p5',client:'c5',service:'Construcción de casa de 140 m² (Ejemplo)',stage:'scheduled',day:-40,len:150,quote:'q5'},
 {key:'p6',client:'c6',service:'Pisos porcelanato y pintura interior (Ejemplo)',stage:'new',day:15,len:10},
 {key:'p7',client:'c7',service:'Adecuación de consultorio dental (Ejemplo)',stage:'quoting',day:21,len:25},
];
const QUOTES=[
 {key:'q1',client:'c1',title:'Cocina y baño principal (Ejemplo)',status:'accepted',lines:[['Demolición y desecho de escombros',1,350000],['Muebles de cocina en melamina',1,1850000],['Sobre de cuarzo 3,2 m',1,980000],['Enchape de baño (porcelanato)',18,22000],['Mano de obra de fontanería',1,420000]]},
 {key:'q2',client:'c2',title:'Terraza techada (Ejemplo)',status:'accepted',lines:[['Estructura metálica galvanizada',32,38000],['Cubierta de policarbonato',32,21000],['Piso de concreto lujado',32,15500],['Iluminación LED',6,28000]]},
 {key:'q3',client:'c3',title:'Local comercial: propuesta inicial (Ejemplo)',status:'draft',lines:[['Cielo raso en gypsum',60,14500],['Pintura interior',180,3200],['Instalación eléctrica comercial',1,1250000]]},
 {key:'q4',client:'c4',title:'Mantenimiento anual (Ejemplo)',status:'accepted',lines:[['Pintura de fachadas',420,2900],['Limpieza de canoas',1,180000],['Revisión de bombas de agua',1,95000]]},
 {key:'q5',client:'c5',title:'Casa de 140 m² llave en mano (Ejemplo)',status:'accepted',lines:[['Obra gris',140,265000],['Acabados',140,155000],['Sistema eléctrico y fontanería',1,6800000]]},
 {key:'q6',client:'c6',title:'Pisos y pintura (Ejemplo)',status:'draft',lines:[['Porcelanato 60×60 instalado',85,24500],['Pintura interior',260,3100]]},
 {key:'q7',client:'c8',title:'Muro de contención (Ejemplo)',status:'declined',lines:[['Muro en bloque relleno',24,68000]]},
];
const PRODUCTS=[
 ['cemento','CEM-50','Cemento gris 50 kg (Ejemplo)','Materiales','saco',120,30,5600,7200],
 ['varilla','VAR-38','Varilla corrugada #3 (Ejemplo)','Materiales','unidad',300,60,2650,3400],
 ['block','BLK-15','Block de concreto 15 cm (Ejemplo)','Materiales','unidad',900,200,520,690],
 ['porcelanato','POR-6060','Porcelanato 60×60 beige (Ejemplo)','Acabados','m²',140,40,14500,19800],
 ['pintura','PIN-GAL','Pintura acrílica blanca, galón (Ejemplo)','Acabados','galón',48,12,11800,15900],
 ['tubo','PVC-12','Tubo PVC 1/2" (Ejemplo)','Fontanería','unidad',75,20,1450,2100],
 ['cable','CAB-12','Cable THHN #12, rollo (Ejemplo)','Electricidad','rollo',18,5,32500,41000],
 ['luminaria','LED-18','Panel LED 18 W (Ejemplo)','Electricidad','unidad',36,10,6900,9800],
];
const SERVICES=[
 ['srv-visita','SRV-VIS','Visita técnica y levantamiento (Ejemplo)','Servicios','visita',25000],
 ['srv-diseno','SRV-DIS','Diseño y planos (Ejemplo)','Servicios','proyecto',450000],
 ['srv-hora','SRV-HORA','Hora de maestro de obras (Ejemplo)','Mano de obra','hora',6500],
];

export async function seed(ctx){
 const {db,apply,anchor,log}=ctx;
 // 1. Account. Fictitious address on the reserved .test domain; confirmed through the admin API, so no mail is sent.
 let user=null;
 for(let page=1;page<=20&&!user;page++){
  const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)throw error;
  user=data.users.find(u=>u.email?.toLowerCase()===DEMO_EMAIL)||null;if(data.users.length<1000)break;
 }
 const metadata={role:'professional',full_name:DEMO_NAME,onboarding_completed:true,is_provider:true,manual_test_account:'pro-demo'};
 if(!apply){log('account',user?'exists':'would be created');ctx.owner=user?.id||null;if(!user)return;}
 else{
  const password=(process.env.PRO_DEMO_TEST_PASSWORD||'').trim();
  if(password.length<16)throw new Error('PRO_DEMO_TEST_PASSWORD (16+ characters) is required.');
  const res=user?await db.auth.admin.updateUserById(user.id,{password,email_confirm:true,user_metadata:metadata,ban_duration:'none'})
   :await db.auth.admin.createUser({email:DEMO_EMAIL,password,email_confirm:true,user_metadata:metadata});
  if(res.error||!res.data.user)throw new Error(`demo account: ${res.error?.message}`);
  user=res.data.user;ctx.owner=user.id;
  await must('profile',db.from('profiles').upsert({id:user.id,email:DEMO_EMAIL,full_name:DEMO_NAME,phone:null,role:'professional',is_provider:true,onboarding_completed:true,
   is_disabled:false,whatsapp_opt_in:false,created_app_environment:'pro-demo',created_source_host:'test.contratacr.com'},{onConflict:'id'}));
  await must('pro grant',db.from('pro_memberships').upsert({user_id:user.id,status:'active',expires_at:null,updated_at:new Date().toISOString()},{onConflict:'user_id'}));
  // Lead and appointment writers require a professionals row (pro_appointment_enabled). It is HIDDEN: out of search,
  // unavailable, availability private, verification pending without a reason (no admin attention row), no phone.
  const pro=await must('professional',db.from('professionals').select('id').eq('profile_id',user.id).maybeSingle());
  if(!pro)await must('professional insert',db.from('professionals').upsert({profile_id:user.id,slug:'ejemplo-constructora-valle-central',whatsapp:'',
   business_name:DEMO_NAME,account_type:'empresa',bio:'Empresa ficticia de demostración (Ejemplo).',oculto_del_buscador:true,is_available:false,availability_public:false,
   verification_status:'pending',created_app_environment:'pro-demo'},{onConflict:'profile_id',ignoreDuplicates:true}));
  else await must('professional hidden',db.from('professionals').update({oculto_del_buscador:true,is_available:false,availability_public:false}).eq('profile_id',user.id));
  log('account',`user ${user.id}, Pro active, hidden professional row`);
 }
 // 2. Workspace document, validated with the same schema and transition rules as PUT /api/pro/workspace.
 const app=appModules("export {businessSchema,emptyBusiness} from './src/lib/pro/business';export {validateWorkspaceTransition} from './src/lib/pro/validate-transition';");
 const stored=await must('workspace',db.from('pro_workspaces').select('document,revision').eq('user_id',ctx.owner).maybeSingle());
 const previous=stored?app.businessSchema.parse({...stored.document,social:[]}):app.emptyBusiness();
 const next=structuredClone(previous);
 const put=(key,row)=>{const i=next[key].findIndex(r=>r.id===row.id);if(i<0)next[key].push(row);else if(key!=='movements'&&!(key==='quotes'&&next[key][i].status!=='draft'))next[key][i]={...next[key][i],...row};};
 for(const c of CLIENTS)put('clients',{id:tid(c.key),name:c.name,email:`${c.key}.ejemplo@example.com`,phone:'',notes:`${c.notes} Datos ficticios de ejemplo.`,archived:!!c.archived,group:c.group,address:c.address,...(c.tradeName?{tradeName:c.tradeName}:{})});
 for(const q of QUOTES)put('quotes',{id:tid(q.key),clientId:tid(q.client),title:q.title,status:q.status,validUntil:crDate(anchor,30),lines:q.lines.map(([description,quantity,price])=>({description,quantity,price,tax:13}))});
 for(const p of PROJECTS){
  // The work row is the project's appointment/visit (no overlaps allowed); the phases carry the long dates.
  const start=crTime(anchor,p.day,'08:00'),end=crTime(anchor,p.day,'10:00');
  put('work',{id:tid(p.key),clientId:tid(p.client),client:CLIENTS.find(c=>c.key===p.client).name,service:p.service,stage:p.stage,start,end,cancelled:false,...(p.quote?{quoteId:tid(p.quote)}:{})});
 }
 for(const [key,sku,name,category,unit,stock,minimum,cost,price] of PRODUCTS){
  const id=tid(`prod-${key}`),exists=next.products.find(r=>r.id===id);
  if(!exists){next.products.push({id,sku,name,category,unit,stock:0,minimum,cost,price,archived:false,itemType:'product'});}
  const mid=tid(`mov-${key}-in`);
  if(!next.movements.some(m=>m.id===mid)){next.products=next.products.map(r=>r.id===id?{...r,stock:r.stock+stock}:r);next.movements.push({id:mid,productId:id,delta:stock,reason:'Entrada inicial de inventario (Ejemplo)',at:`${crDate(anchor,-30)}T15:00:00Z`});}
 }
 {const id=tid('prod-cemento'),mid=tid('mov-cemento-out');if(!next.movements.some(m=>m.id===mid)){next.products=next.products.map(r=>r.id===id?{...r,stock:r.stock-35}:r);next.movements.push({id:mid,productId:id,delta:-35,reason:'Salida a obra: casa de 140 m² (Ejemplo)',at:`${crDate(anchor,-10)}T15:00:00Z`});}}
 for(const [key,sku,name,category,unit,price] of SERVICES)put('products',{id:tid(key),sku,name,category,unit,stock:0,minimum:0,cost:0,price,archived:false,itemType:'service'});
 const slots=[];for(let d=1;d<=10;d++){const start=crTime(anchor,d,'14:00');if(new Date(start).getUTCDay()%6===0)continue;slots.push({start,end:crTime(anchor,d,'16:00')});}
 for(const s of slots)if(!next.availability.some(a=>a.start.slice(0,16)===s.start.slice(0,16)))next.availability.push(s);
 const document=app.validateWorkspaceTransition(previous,next);
 ctx.counts.clients=document.clients.length;ctx.counts.projects=document.work.length;ctx.counts.quotes=document.quotes.length;ctx.counts.catalog=document.products.length;ctx.counts.movements=document.movements.length;
 if(!apply){log('workspace',`would hold ${document.clients.length} clients, ${document.work.length} projects, ${document.quotes.length} quotes, ${document.products.length} items`);return;}
 if(stored&&JSON.stringify(app.businessSchema.parse({...stored.document,social:[]}))===JSON.stringify(document)){log('workspace','unchanged');return;}
 await must('save workspace',db.rpc('pro_save_workspace',{p_user:ctx.owner,p_document:document,p_revision:stored?.revision??0}));
 log('workspace',`saved: ${document.clients.length} clients, ${document.work.length} projects, ${document.quotes.length} quotes, ${document.products.length} items`);
}
