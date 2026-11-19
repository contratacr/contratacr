import {expect,type BrowserContext} from 'playwright/test';
import {fixture,cleanup,post,read,json,snapshot,state,oldDocuments,local,login,origin} from './pro-private-estimate-publications-fixture';
import {productSchema} from '../../src/lib/pro/business';
export {cleanup,post,read,json,local,login,origin};
export const budgetApi='/api/pro/work-budget',costsApi='/api/pro/work-costs';

export async function budgetFixture(context:BrowserContext){
 const f=await fixture(context);
 try{
  const lead={action:'create',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,catalogRevision:0,clientId:f.clientId,title:'Presupuesto privado %_ ñ',description:'Sin cuenta pública ni cita',address:'Por coordinar',sourceLabel:'Referencia privada',forecast:{projectType:'',expectedStart:null,currency:'USD',revenueCents:999999,budgetCents:null,profitCents:null},stageMode:'automatic',stageId:null};
  expect((await post(context,f.owner,lead,'/api/pro/lead-private-core')).status()).toBe(200);
  const convert={action:'convert',actionId:crypto.randomUUID(),leadId:lead.id,leadRevision:1,workId:crypto.randomUUID()};
  const converted=await post(context,f.owner,convert,'/api/pro/lead-private-work');expect(converted.status()).toBe(200);
  const budgetWorkId=(await converted.json()).work.id as string;
  const product=productSchema.parse({id:'budget-material',name:'Material fraccionario',sku:'BUDGET-MAT',stock:10,minimum:0,cost:5,price:100,archived:false,itemType:'product',unit:'unidad'});
  await f.db.from('pro_products').insert({user_id:f.owner.id,...product}).throwOnError();
  expect((await f.db.from('professionals').select('id').eq('profile_id',f.owner.id).throwOnError()).data).toEqual([]);
  return{...f,budgetWorkId,lead,convert,product};
 }catch(error){await cleanup(f);throw error;}
}
export type BudgetFixture=Awaited<ReturnType<typeof budgetFixture>>;
export async function overview(context:BrowserContext,f:BudgetFixture){return json(context,{view:'overview',workId:f.budgetWorkId},budgetApi);}
export async function budgetWrite(context:BrowserContext,f:BudgetFixture,fields:Record<string,unknown>){
 const current=await overview(context,f),input={actionId:crypto.randomUUID(),workId:f.budgetWorkId,clientId:current.work.clientId,revision:current.revision,...fields};
 const response=await post(context,f.owner,input,budgetApi);expect(response.status()).toBe(200);return{input,result:await response.json()};
}
export async function sourceCosts(context:BrowserContext,f:BudgetFixture){return json(context,{clientId:f.clientId,workId:f.budgetWorkId},costsApi);}
export async function costWrite(context:BrowserContext,f:BudgetFixture,fields:Record<string,unknown>){
 const current=await sourceCosts(context,f),input={requestId:crypto.randomUUID(),clientId:f.clientId,workId:f.budgetWorkId,revision:current.revision,...fields};
 const response=await post(context,f.owner,input,costsApi);expect(response.status()).toBe(200);return{input,result:await response.json()};
}
export async function operation(context:BrowserContext,f:BudgetFixture,fields:Record<string,unknown>){
 const current=await json(context,{clientId:f.clientId,workId:f.budgetWorkId},'/api/pro/client-operations');
 const input={actionId:crypto.randomUUID(),clientId:f.clientId,workId:f.budgetWorkId,revision:current.revision,...fields};
 const response=await post(context,f.owner,input,'/api/pro/client-operations');expect(response.status()).toBe(200);return input;
}
export async function expenseWrite(context:BrowserContext,f:BudgetFixture,fields:Record<string,unknown>){
 const current=await json(context,{kind:'expenses'},'/api/pro/expenses'),input={actionId:crypto.randomUUID(),revision:current.revision,...fields};
 const response=await post(context,f.owner,input,'/api/pro/expenses');expect(response.status()).toBe(200);return{input,result:await response.json()};
}
export async function seedBudgetActuals(context:BrowserContext,f:BudgetFixture){
 const date='2024-02-29',sharedId=crypto.randomUUID();
 const material=await operation(context,f,{kind:'material',actionId:sharedId,productId:f.product.id,quantity:0.001});
 const material2=await operation(context,f,{kind:'material',productId:f.product.id,quantity:0.001});
 const time=await costWrite(context,f,{action:'add_time',requestId:sharedId,date,minutes:1,hourlyCostCents:30,note:'Tiempo valorado uno'});
 const time2=await costWrite(context,f,{action:'add_time',date,minutes:1,hourlyCostCents:30,note:'Tiempo valorado dos'});
 const unknown=await costWrite(context,f,{action:'add_time',date,minutes:15,hourlyCostCents:null,note:'Horas pendientes de valorar'});
 const supplierId=crypto.randomUUID(),expenseId=crypto.randomUUID();
 await expenseWrite(context,f,{action:'supplier',id:supplierId,name:'Proveedor presupuesto',identification:'',email:'',phone:'',archived:false});
 await expenseWrite(context,f,{action:'expense',id:expenseId,supplierId,date,dueDate:null,currency:'CRC',concept:'Transporte %_ ñ',amountCents:100});
 const expense=await costWrite(context,f,{action:'link_expense',expenseId,expenseRevision:(await sourceCosts(context,f)).expenseRevision});
 expect((await sourceCosts(context,f)).summary).toMatchObject({materialCents:2,laborCents:2,expensesCents:100,totalCostCents:104,uncostedMinutes:15,uncostedCount:1,agreedCents:null,resultCents:null});
 return{date,sharedId,material,material2,time,time2,unknown,supplierId,expenseId,expense};
}
const stable=(rows:unknown[])=>rows.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
export async function budgetBusiness(f:BudgetFixture){
 const result:Record<string,unknown>={business:await snapshot(f),privateSources:await state(f),oldDocuments:await oldDocuments(f)};
 for(const table of ['pro_workspace_core','pro_products','pro_movements','pro_work_cost_requests','pro_work_cost_state','pro_work_expense_assignments','pro_internal_expenses','pro_expense_suppliers','pro_expense_payments','pro_expense_state','pro_expense_requests']){
  result[table]=stable((await f.db.from(table).select('*').eq('user_id',f.owner.id).throwOnError()).data??[]);
 }
 return result;
}
