/* eslint-disable @typescript-eslint/no-require-imports */
// Add fictitious pagination examples without changing existing simulator records.
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync('.env.test', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]; }));
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321') throw Error('Loopback only.');
const account=JSON.parse(fs.readFileSync('/tmp/contratacr-pro-sim-login.json','utf8'));
if (!/^pro-simulador-\d+@contratacr\.test$/.test(account.email)) throw Error('Disposable simulator account required.');
(async () => {
 const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
 const user=await db.auth.admin.getUserById(account.id);
 if(user.error||user.data.user?.email!==account.email)throw Error('Unexpected account.');
 for(const kind of ['clients','products']) {
  const previous=await db.from('pro_'+kind).select('id').eq('user_id',account.id).throwOnError();
  const rows=[];
  for(let i=1;i<=35;i++) {
   const number=String(i).padStart(2,'0'),id=`catalog-demo-${kind}-${number}`;
   if(previous.data.some(r=>r.id===id))continue;
   rows.push(kind==='clients'?{id,name:'Cliente de demostración '+number,email:'',phone:'',notes:'Ejemplo ficticio local para revisar paginación.',archived:false}:{id,name:'Material de demostración '+number,sku:'LOCAL-CAT-'+number,stock:i,minimum:5,cost:500,price:1000,archived:false,category:'Demostración',unit:'unidad'});
  }
  if(!rows.length)continue;
  const core=await db.from('pro_workspace_core').select('revision').eq('user_id',account.id).single().throwOnError();
  const saved=await db.rpc('pro_mutate_catalog',{p_user:account.id,p_kind:kind,p_rows:rows,p_revision:core.data.revision,p_importing:true});
  if(saved.error)throw saved.error;
  console.log(kind+': '+rows.length+' fictitious records added; existing rows preserved.');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
