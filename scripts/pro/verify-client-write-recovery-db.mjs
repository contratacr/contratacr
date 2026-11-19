// Isolated PostgreSQL only: installs real catalog modules, never reads env or a shared DB.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),uid=()=>crypto.randomUUID(),owner=uid(),other=uid();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table profiles(id uuid primary key,role text,is_disabled boolean);grant select on profiles to service_role;`);
await db.query("insert into profiles values($1,'professional',false),($2,'professional',false)",[owner,other]);
const install=async file=>db.exec(await readFile('docs/pro/sql/'+file,'utf8'));
await install('memberships-draft.sql');
const legacy={id:'legacy-client',name:'Original',email:'',phone:'88881111',notes:'Nota original',archived:false,tradeName:'Negocio',group:'Grupo original',address:'Dirección original'};
const original={version:1,clients:[legacy],products:[{id:'legacy-product',sku:'OLD',name:'Producto intacto',stock:3,minimum:1,cost:1,price:2,archived:false}],movements:[],work:[],quotes:[],social:[],availability:[],quoteLinks:[]};
await db.query('select pro_save_workspace($1,$2,0)',[owner,original]);
for(const file of ['catalog-storage-draft.sql','catalog-item-types-local.sql','catalog-mutations-draft.sql','catalog-pages-draft.sql'])await install(file);
const snapshot=async()=>({clients:(await db.query('select * from pro_clients order by user_id,id')).rows,products:(await db.query('select * from pro_products order by user_id,id')).rows,movements:(await db.query('select * from pro_movements order by user_id,id')).rows,core:(await db.query('select * from pro_workspace_core order by user_id')).rows,legacy:(await db.query('select * from pro_workspace_legacy_backup order by user_id')).rows});
const before=await snapshot();await install('client-write-recovery-local.sql');assert.deepEqual(await snapshot(),before);assert.equal((await db.query('select count(*) n from pro_client_write_actions')).rows[0].n,0);
await db.exec('set role service_role');
const row=()=>({id:uid(),name:'Contacto sin cédula',email:'',phone:'',notes:'Sin identificación es válido',archived:false});
const input=(client=row(),revision=1,mode='create')=>({kind:'clients',revision,rows:[client],movements:[],importing:false,clientActionId:uid(),clientWriteMode:mode});
const call=async(value,actor=owner)=>(await db.query('select pro_client_write_record($1,$2) r',[actor,value])).rows[0].r;
const count=async()=>Number((await db.query('select count(*) n from pro_client_write_actions')).rows[0].n);
const revision=async()=>Number((await db.query('select revision from pro_workspace_core where user_id=$1',[owner])).rows[0].revision);
const receipt= input(),ack=await call(receipt);assert.deepEqual(ack,{id:receipt.rows[0].id,revision:2});assert.equal(await revision(),2);assert.equal(await count(),1);
for(let i=0;i<3;i++)assert.deepEqual(await call(receipt),ack);assert.equal(await count(),1);assert.equal(await revision(),2);
// Existing writers share the CAS. A historical replay must not revert a later edit/archive.
const later={...receipt.rows[0],name:'Cambio legítimo posterior',archived:true};
await db.query("select pro_mutate_catalog($1,'clients',$2,2)",[owner,[later]]);assert.equal(await revision(),3);assert.deepEqual(await call(receipt),ack);assert.equal(await revision(),3);assert.equal((await db.query('select name,archived from pro_clients where user_id=$1 and id=$2',[owner,later.id])).rows[0].name,later.name);
await assert.rejects(()=>call({...receipt,rows:[{...receipt.rows[0],name:'Payload diferente'}]}),error=>error.code==='40001');
const stale=input();await assert.rejects(()=>call(stale),error=>error.code==='40001');assert.equal(await count(),1);assert.equal(await revision(),3);
// Edit supports legacy text IDs and all optional contact columns.
const edit=input({...legacy,name:'Nombre editado',notes:'Nueva nota',identification:'101230456'},3,'edit'),editAck=await call(edit);assert.equal(editAck.revision,4);assert.deepEqual(await call(edit),editAck);assert.equal(await count(),2);
for(const value of [null,{}, {...input(row(),4),kind:'products'}, {...input(row(),4),movements:[{}]}, {...input(row(),4),rows:[]}, {...input(row(),4),rows:[row(),row()]}, {...input(row(),4),importing:true}, {...input(row(),4),unknown:true}, {...input(row(),4),clientWriteMode:null}, {...input(row(),4),rows:[{...row(),name:null}]}, {...input(row(),4),rows:[{...row(),privateField:'unexpected'}]}])await assert.rejects(()=>call(value));
await assert.rejects(()=>call(input({...row(),id:legacy.id},4)),error=>error.code==='22023');
await assert.rejects(()=>call(input({...later,archived:false},4)),error=>error.code==='40001');
await assert.rejects(()=>call(input({...row(),id:'missing-id'},4,'edit')),error=>error.code==='40001');
await assert.rejects(()=>call(input({...legacy},0,'edit'),other),error=>error.code==='40001');assert.equal(await count(),2);assert.equal(await revision(),4);
// The same action UUID in a different actor namespace never reads the first actor's receipt.
const foreign={...receipt,revision:0,rows:[{...row(),name:'Otro propietario'}]};const foreignAck=await call(foreign,other);assert.equal(foreignAck.revision,1);assert.equal(await count(),3);
await assert.rejects(()=>call(input(row(),4),null),error=>error.code==='42501');
// Receipt failure occurs after the catalog call, so PostgreSQL must roll both back atomically.
await db.exec('reset role;revoke insert on pro_client_write_actions from service_role;set role service_role');
const failing=input(row(),4),beforeRollback=await snapshot();await assert.rejects(()=>call(failing),error=>error.code==='42501');assert.deepEqual(await snapshot(),beforeRollback);assert.equal(await count(),3);
await db.exec('reset role;grant insert on pro_client_write_actions to service_role;set role service_role');assert.equal((await call(failing)).revision,5);assert.equal(await count(),4);
// Reapplying only this additive module preserves every row and receipt.
await db.exec('reset role');const final=await snapshot(),actions=(await db.query('select * from pro_client_write_actions order by actor_id,action_id')).rows;await install('client-write-recovery-local.sql');assert.deepEqual(await snapshot(),final);assert.deepEqual((await db.query('select * from pro_client_write_actions order by actor_id,action_id')).rows,actions);
assert.deepEqual(final.products,before.products);assert.deepEqual(final.movements,before.movements);assert.deepEqual(final.legacy,before.legacy);
// Real RLS/grants: neither anon nor authenticated can read receipts, mutate or call the RPC.
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await assert.rejects(()=>db.query('select * from pro_client_write_actions'),error=>error.code==='42501');
 await assert.rejects(()=>db.query("insert into pro_client_write_actions values($1,$2,'{}','{}')",[owner,uid()]),error=>error.code==='42501');
 await assert.rejects(()=>call(receipt),error=>error.code==='42501');
 if(role==='authenticated'){await assert.rejects(()=>db.query("update pro_clients set name='No permitido'"),error=>error.code==='42501');assert.equal((await db.query('select * from pro_clients where user_id=$1',[other])).rows.length,0);}
 await db.exec('reset role');
}
await db.close();
console.log('PASS isolated customer writes: real catalog modules/roles, installation preservation, create/edit legacy IDs, same-action replay before CAS/current state, different-body conflict, stale CAS, actor isolation, malformed input, receipt failure rollback, RLS/grants and idempotent module reapply. Concurrency requires the separate real-PostgreSQL integration window.');
