/* eslint-disable @typescript-eslint/no-require-imports */
// Fictitious examples, restricted to the simulator's disposable loopback account.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {buildSync}=require('esbuild');
const env=Object.fromEntries(fs.readFileSync('.env.test','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}));
if(env.NEXT_PUBLIC_SUPABASE_URL!=='http://127.0.0.1:54321')throw Error('Only loopback is permitted.');
const account=JSON.parse(fs.readFileSync('/tmp/contratacr-pro-sim-login.json','utf8'));
if(!/^pro-simulador-\d+@contratacr\.test$/.test(account.email))throw Error('Only disposable simulator accounts are permitted.');
const compiled={exports:{}};
const bundle=buildSync({stdin:{contents:"export {validateWorkspaceTransition} from './src/lib/pro/validate-transition';export {businessSchema} from './src/lib/pro/business';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs'});
new Function('module','exports','require',bundle.outputFiles[0].text)(compiled,compiled.exports,require);
(async()=>{
 const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
 const {data:user,error:authError}=await db.auth.admin.getUserById(account.id);if(authError||user.user.email!==account.email)throw Error('Unexpected account.');
 const {data:stored,error}=await db.from('pro_workspaces').select('document,revision').eq('user_id',account.id).single();if(error)throw error;
 const previous=compiled.exports.businessSchema.parse(stored.document);
 const next=structuredClone(previous);
 const services=['Limpieza de oficina','Reparación de grifería','Instalación de luminarias','Pintura de habitación','Mantenimiento de jardín','Revisión de computadora','Instalación de cámaras','Reparación de puerta','Lavado de muebles'];
 const areas=['Atenas','Grecia','Alajuela','Heredia','San José','Cartago','Escazú','Santa Ana','San Ramón'];
 function add(key,row){if(!next[key].some(r=>r.id===row.id))next[key].push(row);}
 for(let i=1;i<=9;i++){
  const id=`demo-client-${i}`;add('clients',{id,name:`Cliente ficticio ${String(i).padStart(2,'0')} · ${areas[i-1]}`,email:`cliente${i}@example.com`,phone:'',notes:`Ejemplo ficticio de ${areas[i-1]}. ${i%3===0?'Cliente recurrente.':'Primera consulta.'}`,archived:i===9});
  const status=i%3===0?'declined':i%3===1?'draft':'accepted';
  add('quotes',{id:`demo-quote-${i}`,clientId:id,title:services[i-1],lines:[{description:services[i-1],quantity:1,price:12000+i*3500,tax:13},{description:'Materiales de ejemplo',quantity:2,price:1500+i*100,tax:13}],status,validUntil:'2026-11-30'});
  const day=String(24+i).padStart(2,'0');const dayISO=i<=7?`2026-10-${day}`:`2026-11-0${i-7}`;
  add('work',{id:`demo-appointment-${i}`,clientId:id,client:next.clients.find(c=>c.id===id).name,service:services[i-1],stage:i===1?'completed':'scheduled',start:`${dayISO}T09:00:00-06:00`,end:`${dayISO}T10:30:00-06:00`,cancelled:i===9,...(status==='accepted'?{quoteId:`demo-quote-${i}`}:{})});
  const names=['Cable eléctrico','Pintura blanca','Llave de paso','Luminaria LED','Abono orgánico','Conector de red','Cámara de ejemplo','Bisagra','Producto de limpieza'];
  add('products',{id:`demo-product-${i}`,sku:`DEMO-${String(i+1).padStart(3,'0')}`,name:names[i-1],stock:i%3===0?2:10+i,minimum:3,cost:800+i*350,price:1500+i*600,archived:false});
 }
 for(let i=0;i<10;i++){
  const product=next.products[i];const id=`demo-movement-${i}`;
  if(!next.movements.some(m=>m.id===id)){product.stock+=1;add('movements',{id,productId:product.id,delta:1,reason:'Entrada ficticia para demostración',at:`2026-10-${String(10+i).padStart(2,'0')}T15:00:00Z`});}
 }
 const document=compiled.exports.validateWorkspaceTransition(previous,next);
 const {data:history,error:historyError}=await db.from('pro_social_requests').select('*').eq('user_id',account.id);if(historyError)throw historyError;
 fs.writeFileSync('/tmp/contratacr-pro-demo-before.json',JSON.stringify({stored,history}),{mode:0o600});
 const saved=await db.rpc('pro_save_workspace',{p_user:account.id,p_document:document,p_revision:stored.revision});if(saved.error)throw saved.error;
 for(let i=0;i<10;i++){
  const month=`2026-${String(10-i).padStart(2,'0')}`;
  if(history.some(r=>r.month===month))continue;
  const status=i===0?'pending':i===1?'approved':i%3===0?'rejected':'published';
  const id=crypto.createHash('sha256').update(account.id+month).digest('hex').slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
  const row={id,user_id:account.id,month,title:`Difusión ficticia ${10-i}: ${i===0?'promoción del mes':'caso de éxito'}`,link:'https://example.com/demo',description:'Contenido ficticio para revisar la presentación. No se ha enviado ni publicado en redes.',status,note:status==='pending'?'':status==='rejected'?'Ejemplo de rechazo: mejorar imagen.':'Estado ficticio de demostración; no representa una publicación real.',published_url:status==='published'?'https://example.com/publicacion-ficticia':'',created_at:`${month}-05T15:00:00Z`,updated_at:`${month}-06T15:00:00Z`};
  const result=await db.from('pro_social_requests').insert(row);if(result.error)throw result.error;
 }
 const check=await db.from('pro_workspaces').select('document').eq('user_id',account.id).single();if(check.error)throw check.error;
 const social=await db.from('pro_social_requests').select('id',{count:'exact',head:true}).eq('user_id',account.id);if(social.error)throw social.error;
 console.log(JSON.stringify({clients:check.data.document.clients.length,appointments:check.data.document.work.length,quotes:check.data.document.quotes.length,products:check.data.document.products.length,movements:check.data.document.movements.length,social:social.count}));
})();
