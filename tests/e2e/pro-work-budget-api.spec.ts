import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {test,expect,type BrowserContext} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {estimateInput} from './pro-private-estimate-publications-fixture';
import {workBudgetCodesPageSchema,workBudgetCostsPageSchema,workBudgetCostDetailSchema,workBudgetHistoryPageSchema,workBudgetOverviewSchema,workBudgetReceiptSchema} from '../../src/lib/pro/work-budget';
import {budgetFixture,cleanup,local,login,post,read,json,budgetApi,budgetWrite,overview,seedBudgetActuals,budgetBusiness,costWrite,operation,expenseWrite,sourceCosts,type BudgetFixture} from './work-budget-fixture';
import {stableSnapshotRows} from './stable-rows';
const uuid=()=>crypto.randomUUID();
async function codes(context:BrowserContext,f:BudgetFixture,query:Record<string,string>={}){return workBudgetCodesPageSchema.parse(await json(context,{view:'codes',workId:f.budgetWorkId,...query},budgetApi));}
async function costs(context:BrowserContext,f:BudgetFixture,query:Record<string,string>={}){return workBudgetCostsPageSchema.parse(await json(context,{view:'costs',workId:f.budgetWorkId,...query},budgetApi));}
async function receipt(context:BrowserContext,actionId:string){return workBudgetReceiptSchema.parse(await json(context,{view:'action',actionId},budgetApi));}
async function selectedCost(context:BrowserContext,f:BudgetFixture,kind:string,id:string){return workBudgetCostDetailSchema.parse(await json(context,{view:'cost',workId:f.budgetWorkId,kind,id},budgetApi));}
async function budgetRows(f:BudgetFixture){
 const rows:Record<string,unknown>={};
 for(const table of ['pro_work_budget_state','pro_work_budget_codes','pro_work_budget_assignments','pro_work_budget_actions'])rows[table]=stableSnapshotRows((await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data)?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return rows;
}
async function assign(context:BrowserContext,f:BudgetFixture,source:Awaited<ReturnType<typeof costs>>['items'][number],codeId:string|null){return budgetWrite(context,f,{action:'assign',source:{kind:source.kind,id:source.id,fingerprint:source.fingerprint},codeId});}

test('Work budget API: real two-level groups and item plans classify typed actual costs without financial writes or double counting',async({context,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await budgetFixture(context);
 try{
  const actual=await seedBudgetActuals(context,f),before=await budgetBusiness(f),empty=workBudgetOverviewSchema.parse(await overview(context,f));
  expect(empty).toMatchObject({currency:'CRC',revision:0,codeCount:0,canWrite:true,summary:{actualCents:104,unknownMinutes:15,unknownCount:1,sourceCount:6,varianceCents:null},unassigned:{actualCents:104,sourceCount:6}});
  const beforeReads=await budgetRows(f);await codes(context,f);await costs(context,f);await receipt(context,uuid());expect(await budgetRows(f)).toEqual(beforeReads);
  const groupA=uuid(),groupB=uuid(),materialCode=uuid(),laborCode=uuid(),expenseCode=uuid(),spareCode=uuid();
  await budgetWrite(context,f,{action:'save_group',id:groupA,code:'01',title:'Preparación'});
  await budgetWrite(context,f,{action:'save_group',id:groupB,code:'02',title:'Terminación'});
  await budgetWrite(context,f,{action:'save_item',id:materialCode,code:'01.10',title:'Materiales',parentId:groupA,plannedCents:200});
  await budgetWrite(context,f,{action:'save_item',id:laborCode,code:'01.20',title:'Mano de obra',parentId:groupA,plannedCents:300});
  await budgetWrite(context,f,{action:'save_item',id:expenseCode,code:'02.10',title:'Transporte',parentId:groupB,plannedCents:400});
  await budgetWrite(context,f,{action:'save_item',id:spareCode,code:'03',title:'Reserva independiente',parentId:null,plannedCents:100});
  const sources=(await costs(context,f)).items;
  expect(sources.filter(row=>row.id===actual.sharedId).map(row=>row.kind).toSorted()).toEqual(['material','time']);
  expect((await selectedCost(context,f,'material',actual.sharedId)).item).toMatchObject({kind:'material',id:actual.sharedId,amountCents:1,minutes:null});
  expect((await selectedCost(context,f,'time',actual.sharedId)).item).toMatchObject({kind:'time',id:actual.sharedId,amountCents:1,minutes:1});
  expect(sources.filter(row=>row.kind==='material').map(row=>row.amountCents)).toEqual([1,1]);
  expect(sources.filter(row=>row.kind==='time'&&row.amountCents!==null).map(row=>row.amountCents)).toEqual([1,1]);
  for(const source of sources)await assign(context,f,source,source.kind==='material'?materialCode:source.kind==='time'?laborCode:expenseCode);
  const grouped=await codes(context,f),find=(id:string)=>grouped.items.find(row=>row.code.id===id)!;
  expect(find(groupA).totals).toMatchObject({plannedCents:500,actualCents:4,unknownMinutes:15,sourceCount:5,varianceCents:null});
  expect(find(groupB).totals).toMatchObject({plannedCents:400,actualCents:100,unknownCount:0,sourceCount:1,varianceCents:300});
  expect((await overview(context,f)).summary).toMatchObject({plannedCents:1000,actualCents:104,unknownMinutes:15,sourceCount:6,varianceCents:null});
  expect((await overview(context,f)).unassigned.sourceCount).toBe(0);
  const expense=sources.find(row=>row.kind==='expense')!;
  await assign(context,f,expense,spareCode);await assign(context,f,expense,null);
  expect((await overview(context,f)).unassigned).toMatchObject({actualCents:100,sourceCount:1});
  const firstArchive=await budgetWrite(context,f,{action:'archive',id:materialCode});
  expect((await overview(context,f)).summary).toMatchObject({plannedCents:1000,actualCents:104,sourceCount:6});
  const archived=(await codes(context,f,{status:'archived'})).items;expect(archived.find(row=>row.code.id===materialCode)?.totals.actualCents).toBe(2);
  expect(await receipt(context,firstArchive.input.actionId)).toEqual({receipt:firstArchive});
  const rev=(await overview(context,f)).revision;
  expect((await post(context,f.owner,{action:'archive',actionId:uuid(),workId:f.budgetWorkId,clientId:f.clientId,revision:rev,id:groupA},budgetApi)).status()).toBe(409);
  await budgetWrite(context,f,{action:'archive',id:laborCode});await budgetWrite(context,f,{action:'archive',id:groupA});
  expect((await post(context,f.owner,{action:'restore',actionId:uuid(),workId:f.budgetWorkId,clientId:f.clientId,revision:(await overview(context,f)).revision,id:materialCode},budgetApi)).status()).toBe(409);
  await budgetWrite(context,f,{action:'restore',id:groupA});await budgetWrite(context,f,{action:'restore',id:materialCode});
  const result=await overview(context,f);expect(result.summary).toMatchObject({plannedCents:1000,actualCents:104,unknownMinutes:15});
  expect(await budgetBusiness(f)).toEqual(before);
 }finally{await cleanup(f);}
});

test('Work budget API: canonical expense changes and append-only reversals retain historical classifications and invalidate stale source/cursor facts',async({context,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await budgetFixture(context);
 try{
  const actual=await seedBudgetActuals(context,f),codeId=uuid();
  const saved=await budgetWrite(context,f,{action:'save_item',id:codeId,code:'COST',title:'Costos reales',parentId:null,plannedCents:500});
  const initial=(await costs(context,f)).items;
  for(const source of initial)await assign(context,f,source,codeId);
  const originalHistory=workBudgetHistoryPageSchema.parse(await json(context,{view:'history',workId:f.budgetWorkId},budgetApi));
  const historicalExpense=originalHistory.items.find(row=>row.input.action==='assign'&&row.input.source.kind==='expense')!;
  expect(historicalExpense.context).toMatchObject({source:{kind:'expense',id:actual.expense.result.id,title:'Transporte %_ ñ',date:actual.date,amountCents:100,minutes:null},fromCode:null,toCode:{id:codeId,title:'Costos reales'}});
  const oldExpense=initial.find(row=>row.kind==='expense')!,oldOverview=await overview(context,f),savedReceipt=await receipt(context,saved.input.actionId);
  expect((await selectedCost(context,f,'expense',oldExpense.id)).item).toEqual({...oldExpense,codeId,code:saved.result.code});
  await expenseWrite(context,f,{action:'expense',id:actual.expenseId,supplierId:actual.supplierId,date:actual.date,dueDate:null,currency:'CRC',concept:'Transporte corregido',amountCents:175});
  const changed=await overview(context,f);expect(changed.sourceFingerprint).not.toBe(oldOverview.sourceFingerprint);expect(changed.revision).toBe(oldOverview.revision);expect(changed.summary.actualCents).toBe(179);
  const currentExpense=(await selectedCost(context,f,'expense',oldExpense.id)).item!;expect(currentExpense).toMatchObject({id:oldExpense.id,title:'Transporte corregido',amountCents:175});expect(currentExpense.fingerprint).not.toBe(oldExpense.fingerprint);
  expect((await post(context,f.owner,{action:'assign',actionId:uuid(),workId:f.budgetWorkId,clientId:f.clientId,revision:changed.revision,source:{kind:oldExpense.kind,id:oldExpense.id,fingerprint:oldExpense.fingerprint},codeId:null},budgetApi)).status()).toBe(409);
  expect(await receipt(context,saved.input.actionId)).toEqual(savedReceipt);
  expect((await post(context,f.owner,saved.input,budgetApi)).status()).toBe(200);expect(await receipt(context,saved.input.actionId)).toEqual(savedReceipt);
  await budgetWrite(context,f,{action:'save_item',id:codeId,code:'COST',title:'Nombre posterior del código',parentId:null,plannedCents:500});
  await operation(context,f,{kind:'material_return',entryId:actual.material.actionId,note:'Material no utilizado'});
  await costWrite(context,f,{action:'edit_time',entryId:actual.sharedId,reason:'Tiempo corregido',date:actual.date,minutes:2,hourlyCostCents:30,note:'Reemplazo independiente'});
  await costWrite(context,f,{action:'void_time',entryId:actual.unknown.result.id,reason:'Registro duplicado sin valoración'});
  await costWrite(context,f,{action:'unlink_expense',entryId:actual.expense.result.id,reason:'Reasociación explícita'});
  const relink=await costWrite(context,f,{action:'link_expense',expenseId:actual.expenseId,expenseRevision:(await sourceCosts(context,f)).expenseRevision});
  const current=(await costs(context,f)).items;
  expect(current.some(row=>row.kind==='material'&&row.id===actual.material.actionId)).toBe(false);
  expect(current.some(row=>row.kind==='time'&&row.id===actual.sharedId)).toBe(false);
  expect(current.some(row=>row.id===actual.unknown.result.id)).toBe(false);
  expect(current.some(row=>row.kind==='expense'&&row.id===oldExpense.id)).toBe(false);
  for(const [kind,id] of [['material',actual.sharedId],['time',actual.sharedId],['expense',oldExpense.id]])expect((await selectedCost(context,f,kind,id)).item).toBeNull();
  const replacement=current.find(row=>row.title==='Reemplazo independiente')!,newExpense=current.find(row=>row.kind==='expense')!;
  expect(replacement).toMatchObject({codeId:null,amountCents:1,minutes:2});expect(newExpense).toMatchObject({id:relink.result.id,codeId:null,amountCents:175});expect(newExpense.id).not.toBe(oldExpense.id);
  expect((await selectedCost(context,f,'expense',newExpense.id)).item).toEqual(newExpense);
  expect((await overview(context,f)).summary).toMatchObject({plannedCents:500,actualCents:178,unknownMinutes:0,unknownCount:0,sourceCount:4,varianceCents:322});
  const oldAssignment=(await f.db.from('pro_work_budget_assignments').select('*').eq('owner_id',f.owner.id).eq('work_id',f.budgetWorkId).throwOnError()).data!;
  expect(oldAssignment.length).toBe(6); // Historical assignment facts do not disappear with reversed sources.
  const history=workBudgetHistoryPageSchema.parse(await json(context,{view:'history',workId:f.budgetWorkId},budgetApi));expect(history.items).toHaveLength(8);
  expect(history.items.filter(row=>originalHistory.items.some(old=>old.actionId===row.actionId))).toEqual(originalHistory.items);
  expect(history.items.find(row=>row.actionId===historicalExpense.actionId)?.context).toEqual(historicalExpense.context);
  expect(await receipt(context,saved.input.actionId)).toEqual(savedReceipt);
 }finally{await cleanup(f);}
});

test('Work budget API: full summaries and filtered pages cover 21 codes, costs and immutable history with stale cursor rejection',async({context,baseURL})=>{
 test.setTimeout(240000);local(baseURL);const f=await budgetFixture(context);
 try{
  const ids:string[]=[];
  for(let index=1;index<=21;index++){
   const id=uuid();ids.push(id);
   await budgetWrite(context,f,{action:'save_item',id,code:'P'+String(index).padStart(2,'0'),title:index===21?'Literal %_ ñ':'Partida '+index,parentId:null,plannedCents:index});
   await costWrite(context,f,{action:'add_time',date:'2024-02-29',minutes:1,hourlyCostCents:0,note:index===21?'Literal %_ ñ':'Tiempo '+index});
  }
  const before=await budgetBusiness(f),rows=await budgetRows(f),first=await codes(context,f);expect(first.items).toHaveLength(20);expect(first.nextCursor).not.toBeNull();
  const next=await codes(context,f,{after:first.nextCursor!,atRevision:String(first.revision),atSnapshot:first.fingerprint});
  expect(next.items).toHaveLength(1);expect(next.nextCursor).toBeNull();expect(new Set([...first.items,...next.items].map(row=>row.code.id))).toEqual(new Set(ids));
  expect((await codes(context,f,{q:'%_'})).items.map(row=>row.code.title)).toEqual(['Literal %_ ñ']);
  const costFirst=await costs(context,f),costNext=await costs(context,f,{after:costFirst.nextCursor!,atRevision:String(costFirst.revision),atSnapshot:costFirst.fingerprint});
  expect(costFirst.items).toHaveLength(20);expect(costNext.items).toHaveLength(1);expect(new Set([...costFirst.items,...costNext.items].map(row=>row.kind+':'+row.id)).size).toBe(21);
  expect((await costs(context,f,{q:'%_'})).items.map(row=>row.title)).toEqual(['Literal %_ ñ']);
  const summary=workBudgetOverviewSchema.parse(await overview(context,f));expect(summary.summary).toMatchObject({plannedCents:231,actualCents:0,unknownMinutes:0,sourceCount:21,varianceCents:231});expect(summary.unassigned.sourceCount).toBe(21);
  const history=workBudgetHistoryPageSchema.parse(await json(context,{view:'history',workId:f.budgetWorkId},budgetApi));expect(history.items).toHaveLength(20);
  const older=workBudgetHistoryPageSchema.parse(await json(context,{view:'history',workId:f.budgetWorkId,after:history.nextCursor!},budgetApi));expect(older.items).toHaveLength(1);expect(new Set([...history.items,...older.items].map(row=>row.actionId)).size).toBe(21);
  expect(await budgetBusiness(f)).toEqual(before);expect(await budgetRows(f)).toEqual(rows);
  await costWrite(context,f,{action:'add_time',date:'2024-02-29',minutes:1,hourlyCostCents:null,note:'Changed source snapshot'});
  expect((await read(context,{view:'costs',workId:f.budgetWorkId,after:costFirst.nextCursor!,atRevision:String(costFirst.revision),atSnapshot:costFirst.fingerprint},budgetApi)).status()).toBe(409);
  expect((await read(context,{view:'codes',workId:f.budgetWorkId,after:first.nextCursor!,atRevision:String(first.revision),atSnapshot:first.fingerprint},budgetApi)).status()).toBe(409);
  expect((await overview(context,f)).summary).toMatchObject({plannedCents:231,sourceCount:22,unknownMinutes:1,varianceCents:null});
 }finally{await cleanup(f);}
});

test('Work budget API: metadata CAS, collision and hierarchy guards preserve receipts and prevent work customer rescoping',async({context,baseURL})=>{
 test.setTimeout(120000);local(baseURL);const f=await budgetFixture(context);let gate:Awaited<ReturnType<typeof holdBudget>>|undefined,pending:ReturnType<typeof post>|undefined;
 try{
  const group=await budgetWrite(context,f,{action:'save_group',id:uuid(),code:'G',title:'Grupo'}),item=await budgetWrite(context,f,{action:'save_item',id:uuid(),code:'G.1',title:'Partida',parentId:group.result.code.id,plannedCents:100}),before=await budgetRows(f),business=await budgetBusiness(f);
  const bad=[{...item.input,actionId:uuid(),title:'Stale CAS'}, {...item.input,title:'Action collision'}, {...item.input,actionId:uuid(),revision:2,id:uuid(),code:'G.1'}, {...item.input,actionId:uuid(),revision:2,id:uuid(),code:'CHILD',parentId:item.result.code.id}];
  for(const input of bad)expect((await post(context,f.owner,input,budgetApi)).status()).toBe(409);
  expect(await budgetRows(f)).toEqual(before);expect(await budgetBusiness(f)).toEqual(business);expect(await receipt(context,item.input.actionId)).toEqual({receipt:item});
  const identity=await f.db.from('pro_work').update({clientId:f.secondClient,client:'Cliente alternativo'}).eq('user_id',f.owner.id).eq('id',f.budgetWorkId);expect(identity.error?.code).toBe('23514');
  expect(await budgetBusiness(f)).toEqual(business);
  await f.db.from('pro_work').update({service:'Título del trabajo actualizado',stage:'quoting'}).eq('user_id',f.owner.id).eq('id',f.budgetWorkId).throwOnError();
  expect((await overview(context,f)).work.title).toBe('Título del trabajo actualizado');expect(await receipt(context,item.input.actionId)).toEqual({receipt:item});
  // This original work is not a converted lead or accepted estimate; only the
  // new budget can protect its customer identity after first creation.
  const plain={...f,budgetWorkId:f.workId},initial=await budgetRows(f),first={action:'save_group',actionId:uuid(),workId:f.workId,clientId:f.clientId,revision:0,id:uuid(),code:'FIRST',title:'Primer presupuesto'};
  gate=await holdBudget(plain,true);pending=post(context,f.owner,first,budgetApi);void pending.catch(()=>{});
  await expect.poll(async()=>{const g=gate!;return Number((await psql(g.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM pg_stat_activity WHERE ${g.pid}=ANY(pg_blocking_pids(pid)) AND query LIKE '%pro_work_budget_mutate%';`],{env:process.env})).stdout.trim());},{timeout:10000}).toBe(1);
  gate.releaseWithCustomer(f.secondClient,'Cliente alternativo');expect(await gate.done).toBe(0);expect((await pending).status()).toBe(409);expect(await budgetRows(f)).toEqual(initial);expect(await receipt(context,first.actionId)).toEqual({receipt:null});
  expect((await f.db.from('pro_work').select('clientId').eq('user_id',f.owner.id).eq('id',f.workId).single().throwOnError()).data!.clientId).toBe(f.secondClient);
  await f.db.from('pro_work').update({clientId:f.clientId,client:'Cliente privado sin cuenta'}).eq('user_id',f.owner.id).eq('id',f.workId).throwOnError();
  expect((await post(context,f.owner,first,budgetApi)).status()).toBe(200);
  const guarded=await f.db.from('pro_work').update({clientId:f.secondClient,client:'Cliente alternativo'}).eq('user_id',f.owner.id).eq('id',f.workId);expect(guarded.error?.code).toBe('23514');
  expect((await overview(context,plain)).work.clientId).toBe(f.clientId);
 }finally{gate?.release();if(gate)await gate.done;if(pending)await pending.catch(()=>{});await cleanup(f);}
});

function nativeDatabase(){
 const executable=process.env.PRO_LOCAL_PSQL;if(!executable||!process.env.PGPASSWORD)throw Error('Root must supply the isolated native PostgreSQL test gate.');
 expect(process.env.PGHOST).toMatch(/^(localhost|127\.0\.0\.1)$/);expect(process.env.PGPORT).toBe('54322');expect(process.env.PGDATABASE).toBe('postgres');return executable;
}
async function holdBudget(f:BudgetFixture,workRow=false){
 for(const value of [f.owner.id,f.budgetWorkId])expect(value).toMatch(/^[a-f0-9-]{36}$/);
 const executable=nativeDatabase(),child=spawn(executable,['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});
 let output='',settled=false,released=false,resolveReady:(pid:number)=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};
 const ready=new Promise<number>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('Budget gate did not become ready.'));}},10000);
 const done=new Promise<number>(resolve=>child.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Budget gate exited before locking.'));}resolve(code??255);}));
 child.stderr.on('data',()=>{});child.on('error',()=>{if(!settled){settled=true;rejectReady(Error('Could not start local gate.'));}});
 child.stdout.on('data',chunk=>{output+=String(chunk);if(!settled&&output.includes('BUDGET_GATE_READY')){settled=true;clearTimeout(timer);const lines=output.trim().split(/\r?\n/),pid=Number(lines[0]);if(!Number.isSafeInteger(pid)||pid<=0||lines[1]!=='1')rejectReady(Error('Wrong isolated budget gate.'));else resolveReady(pid);}});
 const release=(statement='')=>{if(released)return;released=true;if(child.stdin.writable)child.stdin.end(statement+'COMMIT;\n\\q\n');};
 const releaseWithCustomer=(clientId:string,name:string)=>{
  expect(workRow).toBe(true);const quote=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
  release(`UPDATE public.pro_work SET "clientId"=${quote(clientId)},client=${quote(name)} WHERE user_id='${f.owner.id}'::uuid AND id='${f.budgetWorkId}';\n`);
 };
 const lockSql=workRow?`SELECT 1 FROM public.pro_work WHERE user_id='${f.owner.id}'::uuid AND id='${f.budgetWorkId}' FOR UPDATE;`:`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('pro-work-budget:${f.owner.id}:${f.budgetWorkId}',0))) locked;`;
 child.stdin.write(`BEGIN;\nSELECT pg_backend_pid();\n${lockSql}\nSELECT 'BUDGET_GATE_READY';\n`);
 try{return{executable,pid:await ready,done,release,releaseWithCustomer};}catch(error){release();child.kill('SIGTERM');await done;throw error;}
}
const psql=promisify(execFile);
test('Work budget API: entitlement expiry after an observed budget mutex wait rolls back all metadata and same-body retry succeeds',async({context,baseURL})=>{
 test.setTimeout(120000);local(baseURL);const f=await budgetFixture(context);let gate:Awaited<ReturnType<typeof holdBudget>>|undefined,pending:ReturnType<typeof post>|undefined;
 try{
  await seedBudgetActuals(context,f);const before=await budgetRows(f),business=await budgetBusiness(f),input={action:'save_group',actionId:uuid(),workId:f.budgetWorkId,clientId:f.clientId,revision:0,id:uuid(),code:'WAIT',title:'Después de la espera'};
  gate=await holdBudget(f);pending=post(context,f.owner,input,budgetApi);void pending.catch(()=>{});
  await expect.poll(async()=>{const g=gate!;return Number((await psql(g.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM pg_stat_activity WHERE ${g.pid}=ANY(pg_blocking_pids(pid)) AND query LIKE '%pro_work_budget_mutate%';`],{env:process.env})).stdout.trim());},{timeout:10000}).toBe(1);
  expect((await psql(gate.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`UPDATE pro_memberships SET status='active',expires_at=clock_timestamp()-interval '1 millisecond' WHERE user_id='${f.owner.id}'::uuid RETURNING 1;`],{env:process.env})).stdout.trim()).toBe('1');
  gate.release();expect(await gate.done).toBe(0);expect((await pending).status()).toBe(403);
  expect(await budgetRows(f)).toEqual(before);expect(await budgetBusiness(f)).toEqual(business);
  await f.db.from('pro_memberships').update({status:'active',expires_at:null}).eq('user_id',f.owner.id).throwOnError();
  expect(await receipt(context,input.actionId)).toEqual({receipt:null});expect((await post(context,f.owner,input,budgetApi)).status()).toBe(200);expect((await receipt(context,input.actionId)).receipt?.input).toEqual(input);
  expect(await budgetBusiness(f)).toEqual(business);
 }finally{gate?.release();if(gate)await gate.done;if(pending)await pending.catch(()=>{});await cleanup(f);}
});

test('Work budget API: owner-only Pro access, raw RPC/table denial and current profile checks do not leak private cost classification',async({context,browser,baseURL})=>{
 test.setTimeout(120000);local(baseURL);const f=await budgetFixture(context),free=await createDisposableAccount({prefix:'budget-free-member'}),member=await browser.newContext({baseURL}),foreign=await browser.newContext({baseURL});let other:BudgetFixture|undefined;
 try{
  await login(member,free);other=await budgetFixture(foreign);
  const invitationCode=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  expect((await post(context,f.owner,{action:'invite',actionId:uuid(),workId:f.budgetWorkId,email:free.email,role:'contributor',code:invitationCode},'/api/pro/team')).status()).toBe(200);
  expect((await post(member,free,{action:'accept',actionId:uuid(),code:invitationCode},'/api/pro/team')).status()).toBe(200);
  const saved=await budgetWrite(context,f,{action:'save_item',id:uuid(),code:'SECRET',title:'PRIVATE_COST_CODE',parentId:null,plannedCents:500}),before=await budgetRows(f),business=await budgetBusiness(f);
  for(const reader of [member,foreign]){
   expect((await read(reader,{view:'overview',workId:f.budgetWorkId},budgetApi)).status()).toBe(403);
   expect((await post(reader,reader===member?free:other.owner,{...saved.input,actionId:uuid(),revision:1,title:'Foreign attempt'},budgetApi)).status()).toBe(403);
  }
  expect(await receipt(foreign,saved.input.actionId)).toEqual({receipt:null});
  for(const change of ['disabled','expired','banned'] as const){
   if(change==='disabled')await f.db.from('profiles').update({is_disabled:true}).eq('id',f.owner.id).throwOnError();
   if(change==='expired')await f.db.from('pro_memberships').update({status:'inactive'}).eq('user_id',f.owner.id).throwOnError();
   if(change==='banned')await f.db.from('professionals').insert({profile_id:f.owner.id,category_id:'desarrollo_web',business_name:'Banned disposable budget fixture',slug:'budget-ban-'+f.owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:true}).throwOnError();
   expect((await read(context,{view:'overview',workId:f.budgetWorkId},budgetApi)).status()).toBe(403);expect((await read(context,{view:'action',actionId:saved.input.actionId},budgetApi)).status()).toBe(403);expect((await post(context,f.owner,saved.input,budgetApi)).status()).toBe(403);
   if(change==='disabled')await f.db.from('profiles').update({is_disabled:false}).eq('id',f.owner.id).throwOnError();
   if(change==='expired')await f.db.from('pro_memberships').update({status:'active',expires_at:null}).eq('user_id',f.owner.id).throwOnError();
   if(change==='banned')await f.db.from('professionals').delete().eq('profile_id',f.owner.id).throwOnError();
  }
  const raw=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});expect((await raw.auth.signInWithPassword({email:f.owner.email,password:f.owner.password})).error).toBeNull();
  expect((await raw.rpc('pro_work_budget_read',{p_actor:f.owner.id,p_work:f.budgetWorkId})).error?.code).toBe('42501');
  expect((await raw.from('pro_work_budget_codes').select('*')).error?.code).toBe('42501');
  expect(await receipt(context,saved.input.actionId)).toEqual({receipt:saved});expect(await budgetRows(f)).toEqual(before);expect(await budgetBusiness(f)).toEqual(business);
 }finally{await member.close();await foreign.close();if(other)await cleanup(other);await cleanupDisposableAccount(free);await cleanup(f);}
});

test('Work budget API: an accepted USD quote remains a commercial reference while planned and actual costs stay CRC without ledger posting',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await budgetFixture(context),customer=await createDisposableAccount({prefix:'budget-reference-client'}),customerContext=await browser.newContext({baseURL});
 try{
  await login(customerContext,customer);await seedBudgetActuals(context,f);
  const estimateContext=await json(context,{view:'context',sourceKind:'work',sourceId:f.budgetWorkId},'/api/pro/private-estimates');
  const input=estimateInput(estimateContext,{title:'USD reference only',currency:'USD',validUntil:'2030-12-31'}),saved=await post(context,f.owner,input,'/api/pro/private-estimates');expect(saved.status()).toBe(200);const document=(await saved.json()).estimate;
  const code=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'),publicationId=uuid();
  expect((await post(context,f.owner,{action:'publish',actionId:uuid(),publicationId,estimateId:document.id,estimateRevision:1,recipient:{kind:'claim',email:customer.email,code}},'/api/pro/private-estimate-publications')).status()).toBe(200);
  const claimed=await post(customerContext,customer,{action:'claim',actionId:uuid(),code},'/api/pro/private-estimate-publications');expect(claimed.status()).toBe(200);const shared=(await claimed.json()).publication;
  const accepted=await post(customerContext,customer,{action:'accept',actionId:uuid(),publicationId,revision:shared.revision,contentHash:shared.contentHash},'/api/pro/private-estimate-publications');expect(accepted.status()).toBe(200);
  const linkedContext=await json(context,{view:'context',publicationId},'/api/pro/private-estimate-work');
  const linked=await post(context,f.owner,{action:'continue',actionId:uuid(),publicationId,contentHash:linkedContext.contentHash,publicationRevision:linkedContext.publicationRevision,target:{kind:'existing',workId:f.budgetWorkId,fingerprint:linkedContext.requiredWork.fingerprint}},'/api/pro/private-estimate-work');expect(linked.status()).toBe(200);const agreement=(await linked.json()).agreement;
  expect(agreement).toMatchObject({currency:'USD',totalCents:2472,workId:f.budgetWorkId});
  const before=await budgetBusiness(f);
  const item=await budgetWrite(context,f,{action:'save_item',id:uuid(),code:'CRC',title:'Presupuesto en colones',parentId:null,plannedCents:10000});
  for(const source of (await costs(context,f)).items)await assign(context,f,source,item.result.code.id);
  expect((await overview(context,f))).toMatchObject({currency:'CRC',summary:{plannedCents:10000,actualCents:104,unknownMinutes:15,varianceCents:null}});
  expect((await sourceCosts(context,f)).summary).toMatchObject({agreedCents:null,resultCents:null,totalCostCents:104});
  expect((await json(context,{clientId:f.clientId,workId:f.budgetWorkId},'/api/pro/client-operations')).work.agreedCents).toBeNull();
  expect((await json(context,{view:'mapping',workId:f.budgetWorkId},'/api/pro/private-estimate-work')).agreement).toEqual(agreement);
  expect(await budgetBusiness(f)).toEqual(before);
 }finally{await customerContext.close();await cleanupDisposableAccount(customer);await cleanup(f);}
});
