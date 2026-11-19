// In-memory PostgreSQL only. Actual catalog schemas/RLS/writer, no env/network/shared DB.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),uid=()=>crypto.randomUUID(),owner=uid(),other=uid();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table profiles(id uuid primary key,role text,is_disabled boolean);grant select on profiles to service_role;`);
await db.query("insert into profiles values($1,'professional',false),($2,'professional',false)",[owner,other]);
const install=async file=>db.exec(await readFile('docs/pro/sql/'+file,'utf8'));
await install('memberships-draft.sql');
const legacy={id:'legacy-product',sku:'OLD',name:'Producto original',stock:5.1234,minimum:1,cost:10.12345,price:20.23456,archived:false,category:'Materiales',unit:'m',cabys:'1234567890123'};
const original={version:1,clients:[{id:'legacy-client',name:'Cliente intacto',email:'',phone:'',notes:'No cambiar',archived:false}],products:[legacy],movements:[{id:'old-movement',productId:legacy.id,delta:1,reason:'Historia original',at:'2026-11-01T15:00:00.000Z'}],work:[],quotes:[],social:[],availability:[],quoteLinks:[]};
await db.query('select pro_save_workspace($1,$2,0)',[owner,original]);
for(const file of ['catalog-storage-draft.sql','catalog-item-types-local.sql','catalog-mutations-draft.sql','catalog-pages-draft.sql'])await install(file);
const snapshot=async()=>({clients:(await db.query('select * from pro_clients order by user_id,id')).rows,products:(await db.query('select * from pro_products order by user_id,id')).rows,movements:(await db.query('select * from pro_movements order by user_id,id')).rows,core:(await db.query('select * from pro_workspace_core order by user_id')).rows,legacy:(await db.query('select * from pro_workspace_legacy_backup order by user_id')).rows});
const before=await snapshot();await install('inventory-write-recovery-local.sql');assert.deepEqual(await snapshot(),before);
await db.exec('set role service_role');
const row=()=>({id:uid(),sku:'AUTO-'+uid(),name:'Producto nuevo',stock:3,minimum:1,cost:10,price:20,archived:false,itemType:'product'});
const input=(product=row(),revision=1,mode='create',movements=[])=>({kind:'products',revision,rows:[product],movements,importing:false,inventoryActionId:uid(),inventoryWriteMode:mode});
const movement=(productId,delta=1)=>({id:uid(),productId,delta,reason:'Entrada local',at:'2026-11-08T16:00:00.000Z'});
const call=async(value,actor=owner)=>(await db.query('select pro_inventory_write_record($1,$2) r',[actor,value])).rows[0].r;
const count=async()=>Number((await db.query('select count(*) n from pro_inventory_write_actions')).rows[0].n);
const revision=async()=>Number((await db.query('select revision from pro_workspace_core where user_id=$1',[owner])).rows[0].revision);
const create=input(),ack=await call(create);assert.deepEqual(ack,{id:create.rows[0].id,revision:2,movementId:null});for(let i=0;i<3;i++)assert.deepEqual(await call(create),ack);assert.equal(await count(),1);assert.equal(await revision(),2);
// Metadata edit preserves exact legacy precision and the omitted itemType discriminator.
const edited={...legacy,name:'Nombre cambiado',price:31.23456};const edit=input(edited,2,'edit');assert.equal((await call(edit)).revision,3);assert.equal(await count(),2);
// Stock uses the existing three-decimal rounding rule, preserving the exact movement.
const out=movement(legacy.id,-1.125),stock=input({...edited,stock:3.998},3,'movement',[out]),stockAck=await call(stock);assert.deepEqual(stockAck,{id:legacy.id,revision:4,movementId:out.id});assert.deepEqual(await call(stock),stockAck);assert.equal(await count(),3);assert.equal(await revision(),4);
const stored=(await db.query('select * from pro_movements where user_id=$1 and id=$2',[owner,out.id])).rows[0];assert.equal(Number(stored.delta),out.delta);assert.equal(stored.reason,out.reason);assert.equal(stored.at,out.at);assert.equal(stored.productId,legacy.id);
// Later movement/metadata/archive cannot make a historical replay apply its delta twice.
const incoming=movement(legacy.id,2),laterProduct={...edited,name:'Versión posterior',stock:5.998},later=input(laterProduct,4,'movement',[incoming]);assert.equal((await call(later)).revision,5);
await db.query("select pro_mutate_catalog($1,'products',$2,5)",[owner,[{...laterProduct,archived:true}]]);assert.equal(await revision(),6);assert.deepEqual(await call(stock),stockAck);assert.deepEqual(await call(edit),{id:legacy.id,revision:3,movementId:null});assert.deepEqual(await call(create),ack);assert.equal(await revision(),6);assert.equal(Number((await db.query('select stock from pro_products where user_id=$1 and id=$2',[owner,legacy.id])).rows[0].stock),5.998);
assert.equal((await db.query('select count(*)::int n from pro_movements where user_id=$1',[owner])).rows[0].n,3);
await assert.rejects(()=>call({...stock,movements:[{...out,reason:'Different body'}]}),error=>error.code==='40001');
await assert.rejects(()=>call(input(row(),1)),error=>error.code==='40001');
// Rejected constraints leave stock, history, receipts and global revision unchanged.
const preserved=await snapshot(),receiptCount=await count();
const current={...laterProduct,archived:false}; // The canonical row is archived; stock changes must refuse it.
for(const value of [input({...current,stock:6.998},6,'movement',[movement(legacy.id)]),input({...create.rows[0],stock:9},6,'edit'),input({...create.rows[0],itemType:'service',stock:0,minimum:0},6,'edit'),input({...row(),stock:-1},6),input({...row(),sku:create.rows[0].sku.toLowerCase()},6),input({...row(),itemType:'service',stock:1,minimum:0},6),input(row(),6,'movement'),input(row(),6,'edit',[movement(legacy.id)]),input({...row(),stock:2},6,'movement',[{...movement('foreign-product'),delta:0}])])await assert.rejects(()=>call(value));
assert.deepEqual(await snapshot(),preserved);assert.equal(await count(),receiptCount);assert.equal(await revision(),6);
// Services are valid catalog records but never accept movement history.
const service={...row(),stock:0,minimum:0,itemType:'service'};assert.equal((await call(input(service,6))).revision,7);await assert.rejects(()=>call(input({...service,stock:1},7,'movement',[movement(service.id)])));assert.equal(await revision(),7);
for(const invalid of [null,{}, {...input(row(),7),kind:'clients'}, {...input(row(),7),importing:true}, {...input(row(),7),rows:[]}, {...input(row(),7),unknown:true}, {...input(row(),7),inventoryWriteMode:null}, {...input(row(),7),rows:[{...row(),name:null}]}, {...input(row(),7),rows:[{...row(),extra:'unexpected'}]}])await assert.rejects(()=>call(invalid));
await assert.rejects(()=>call(input({...row(),id:'missing-product'},7,'edit')),error=>error.code==='40001');await assert.rejects(()=>call(input({...legacy},0,'edit'),other),error=>error.code==='40001');
// Receipt insert failure after the underlying catalog mutation must roll both back.
await db.exec('reset role;revoke insert on pro_inventory_write_actions from service_role;set role service_role');const failed=input(row(),7),rollback=await snapshot();await assert.rejects(()=>call(failed),error=>error.code==='42501');assert.deepEqual(await snapshot(),rollback);await db.exec('reset role;grant insert on pro_inventory_write_actions to service_role;set role service_role');assert.equal((await call(failed)).revision,8);
// Same UUID belongs to a different actor namespace, never another owner's result.
const foreign={...create,revision:0,rows:[row()]};assert.equal((await call(foreign,other)).revision,1);await assert.rejects(()=>call(input(row(),8),null),error=>error.code==='42501');
await db.exec('reset role');const final=await snapshot(),receipts=(await db.query('select * from pro_inventory_write_actions order by actor_id,action_id')).rows;await install('inventory-write-recovery-local.sql');assert.deepEqual(await snapshot(),final);assert.deepEqual((await db.query('select * from pro_inventory_write_actions order by actor_id,action_id')).rows,receipts);assert.deepEqual(final.clients,before.clients);assert.deepEqual(final.legacy,before.legacy);assert.deepEqual(final.movements.find(r=>r.id==='old-movement'),before.movements[0]);
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await assert.rejects(()=>db.query('select * from pro_inventory_write_actions'),error=>error.code==='42501');await assert.rejects(()=>call(create),error=>error.code==='42501');
 if(role==='authenticated'){await assert.rejects(()=>db.query("update pro_products set stock=999"),error=>error.code==='42501');assert.equal((await db.query('select * from pro_products where user_id=$1',[other])).rows.length,0);assert.equal((await db.query('select * from pro_movements where user_id=$1',[other])).rows.length,0);}
 await db.exec('reset role');
}
await db.close();console.log('PASS isolated inventory: real catalog modules, precise metadata and rounded stock, immutable movement receipt replay before CAS/archive, stale/different-body rejection, negative/service/type/SKU/history constraints, rollback, actor/RLS isolation and reapply preservation.');
