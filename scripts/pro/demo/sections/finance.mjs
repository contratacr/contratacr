// Finance: agreements and payments of the project ledger, change orders, contracts (template + clauses, never
// shared or sent for e-sign), internal invoice drafts (non-fiscal: nothing goes to Hacienda or by e-mail), invoice
// payments, retainer and credit note, payment plan (no reminders), suppliers, expenses, work time costs and a payable.
// Same writers (RPCs and zod schemas) as the /api/pro routes. Every step has a deterministic action id and is skipped
// when its receipt already exists, so a rerun writes nothing new. None of these writers enqueues notifications.
import {uuid,must,tid,crDate,appModules} from '../lib.mjs';

const C=n=>Math.round(n*100); // colones → céntimos
const why=error=>error.issues?error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):error.message;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date());

export async function seed(ctx){
 const {db,apply,anchor,owner,log}=ctx;
 const app=appModules(`export {operationSchema} from './src/lib/pro/client-operations';export {workChangeMutation} from './src/lib/pro/work-changes';
  export {contractMutationSchema} from './src/lib/pro/contracts';export {invoiceMutationSchema} from './src/lib/pro/invoice-drafts';
  export {invoicePaymentMutation} from './src/lib/pro/invoice-payments';export {creditMutationSchema} from './src/lib/pro/credits-retainers';
  export {paymentPlanMutationSchema} from './src/lib/pro/payment-plan';export {expenseMutationSchema} from './src/lib/pro/expenses';
  export {workCostMutationSchema} from './src/lib/pro/work-costs';export {payableMutationSchema} from './src/lib/pro/payables';`);
 // Past days only (payments and costs cannot be dated in the future), relative to the anchor but never after today.
 const past=offset=>{const d=crDate(anchor,offset),t=today();return d>t?t:d;};
 const id=key=>uuid(`finance:${key}`);
 const rpc=(name,args)=>must(name,db.rpc(name,args));
 const has=async(table,ownerCol,col,value)=>(await must(`check ${table}`,db.from(table).select(col).eq(ownerCol,owner).eq(col,value).limit(1))).length>0;
 const tally={done:0,created:0,planned:0,skipped:0};
 const count=(area,n=1)=>{ctx.counts[`finance.${area}`]=(ctx.counts[`finance.${area}`]||0)+n;};
 /** One idempotent write. `receipt` = [table, owner column, key column, key]; `run` builds the input (fresh revisions) and writes. */
 async function step(area,label,receipt,run){
  count(area);
  if(await has(...receipt)){tally.done++;return;}
  if(!apply){tally.planned++;return;}
  try{await run();tally.created++;log('finance',`${area}: ${label}`);}
  catch(error){tally.skipped++;log('finance',`${area}: SKIPPED ${label}: ${why(error)}`);}
 }
 const P=Object.fromEntries([['p1','c1'],['p2','c2'],['p4','c4'],['p5','c5']].map(([w,c])=>[w,{workId:tid(w),clientId:tid(c)}]));

 // 1. Project ledger (Cliente → Finanzas): agreed amount = accepted quote with IVA, plus received payments.
 const clientOp=async input=>{const page=await rpc('pro_client_operations_page',{p_user:owner,p_client:input.clientId,p_work:input.workId});
  const {revision,...clean}=app.operationSchema.parse({...input,revision:page.revision});await rpc('pro_record_client_operation',{p_user:owner,p_input:clean,p_revision:revision});};
 const entry=(area,key,label,input)=>step(area,label,['pro_client_entries','user_id','id',id(key)],()=>clientOp({...input,actionId:id(key)}));
 for(const k of ['p1','p2','p4','p5'])await entry('agreements',`agreement:${k}`,`acuerdo ${k}`,{...P[k],kind:'agreement',
  amountCents:(await rpc('pro_invoice_fiscal_source',{p_user:owner,p_kind:'work',p_id:P[k].workId}))?.totalCents??0});
 const payments=[['p1','pay:p1:anticipo',C(1800000),'Anticipo del 40 % (Ejemplo)'],['p2','pay:p2:anticipo',C(1000000),'Anticipo por transferencia (Ejemplo)'],
  ['p4','pay:p4:total',null,'Pago total contra entrega (Ejemplo)'],['p5','pay:p5:avance1',C(15000000),'Primer avance: fundaciones (Ejemplo)'],['p5','pay:p5:avance2',C(12000000),'Segundo avance: paredes (Ejemplo)']];
 for(const [k,key,amount,note] of payments)await entry('payments',key,note,{...P[k],kind:'payment',note,
  amountCents:amount??(await rpc('pro_work_account',{p_user:owner,p_work:P[k].workId}))?.balanceCents??0});

 // 2. Change orders (Proyecto → Órdenes de cambio). p1 accepted with the client's approval recorded by the provider.
 const changes=[
  ['p1','griferia','Cambio de grifería estándar a línea premium solicitado por el cliente (Ejemplo)',[{description:'Grifería monomando premium para cocina',amountCents:C(145000)},{description:'Juego de grifería termostática para ducha',amountCents:C(210000)}],3,
   'El cliente aprobó el cambio por escrito durante la visita de obra del martes (Ejemplo).'],
  ['p2','ampliacion','Ampliación de la terraza en 4 m² hacia el jardín (Ejemplo)',[{description:'Estructura y cubierta adicional de 4 m²',amountCents:C(298000)},{description:'Dos luminarias LED adicionales',amountCents:C(56000)}],5,null],
  ['p5','cochera','Se elimina el enchape de la cochera; el cliente lo hará después (Ejemplo)',[{description:'Rebaja: enchape de cochera 26 m²',amountCents:-C(650000)}],0,null],
 ];
 for(const [k,key,reason,lines,scheduleDays,acceptNote] of changes){
  const cid=id(`change:${key}`);
  await step('changeOrders',`propuesta ${key}`,['pro_work_change_actions','owner_id','id',id(`change:${key}:propose`)],async()=>{
   const account=await rpc('pro_work_account',{p_user:owner,p_work:P[k].workId});
   await rpc('pro_work_changes_mutate',{p_actor:owner,p_input:app.workChangeMutation.parse({action:'propose',id:cid,actionId:id(`change:${key}:propose`),workId:P[k].workId,baseCents:account.agreedCents,reason,lines,...(scheduleDays?{scheduleDays}:{})})});});
  if(acceptNote)await step('changeOrders',`aprobación ${key}`,['pro_work_change_actions','owner_id','id',id(`change:${key}:accept`)],async()=>{
   const row=await must('change',db.from('pro_work_changes').select('revision').eq('owner_id',owner).eq('id',cid).single());
   await rpc('pro_work_changes_mutate',{p_actor:owner,p_input:app.workChangeMutation.parse({action:'record_acceptance',id:cid,actionId:id(`change:${key}:accept`),revision:row.revision,note:acceptNote})});});
 }

 // 3. Contracts (Proyecto → Contratos; library at Configuración → Contratos): clause library, a template, two drafts.
 const contract=(key,input)=>rpc('pro_contracts_mutate',{p_actor:owner,p_input:app.contractMutationSchema.parse({actionId:id(`contract:${key}`),...input})});
 const act=key=>['pro_contract_actions','actor_id','action_id',id(`contract:${key}`)];
 const clauses=[
  ['alcance','Alcance de los trabajos (Ejemplo)','El contratista ejecutará los trabajos descritos en la cotización aceptada, con los materiales y acabados ahí indicados. Cualquier trabajo adicional se tramitará como orden de cambio por escrito.'],
  ['pago','Forma de pago (Ejemplo)','El cliente pagará un anticipo según el porcentaje indicado en este contrato y el saldo contra avance de obra. Los pagos se realizan por transferencia o SINPE a las cuentas del contratista.'],
  ['plazo','Plazo de ejecución (Ejemplo)','Los trabajos iniciarán en la fecha acordada y se ejecutarán en el plazo estimado del proyecto. Los atrasos por lluvia, falta de acceso o cambios solicitados por el cliente amplían el plazo en igual medida.'],
  ['garantia','Garantía (Ejemplo)','El contratista garantiza la mano de obra por doce meses a partir de la entrega. La garantía de materiales y equipos corresponde a la del fabricante.'],
  ['cambios','Órdenes de cambio (Ejemplo)','Toda modificación del alcance, del precio o del plazo debe constar en una orden de cambio aprobada por ambas partes antes de ejecutarse.'],
 ];
 for(const [key,title,body] of clauses)await step('contracts',`cláusula ${key}`,act(`clause:${key}`),()=>contract(`clause:${key}`,{action:'library_clause_create',id:id(`clause:${key}`),title,body}));
 const templateId=id('template:obra');
 await step('contracts','plantilla',act('template:obra'),()=>contract('template:obra',{action:'template_create',id:templateId,title:'Contrato de obra residencial (Ejemplo)',
  description:'Plantilla base para remodelaciones y construcción de vivienda.',depositPercent:40,libraryClauseIds:clauses.map(([key])=>id(`clause:${key}`))}));
 for(const [k,title,deposit] of [['p1','Contrato de remodelación de cocina y baño (Ejemplo)',40],['p5','Contrato de construcción de casa de 140 m² (Ejemplo)',30]])
  await step('contracts',`contrato ${k}`,act(`contract:${k}`),()=>contract(`contract:${k}`,{action:'contract_create',workId:P[k].workId,id:id(`contract-doc:${k}`),templateId,title,language:'es',estimateId:null,depositPercent:deposit}));

 // 4. Suppliers, expenses (with supplier, category, VAT, billable) and work costs (Finanzas → Gastos; Proyecto → Costos).
 const expState=async()=>(await must('expense state',db.from('pro_expense_state').select('revision').eq('user_id',owner).maybeSingle()))?.revision??0;
 const expense=async(key,input)=>rpc('pro_expense_meta_save',{p_user:owner,p_input:app.expenseMutationSchema.parse({actionId:id(`expense-action:${key}`),revision:await expState(),...input})});
 const expAct=key=>['pro_expense_requests','user_id','action_id',id(`expense-action:${key}`)];
 const suppliers=[['ferreteria','Ferretería y Materiales Pavas (Ejemplo)','ferreteria.pavas.ejemplo@example.com'],['deposito','Depósito de Materiales La Unión (Ejemplo)','deposito.ejemplo@example.com'],
  ['electro','Electro Instalaciones Pérez (Ejemplo)','electro.ejemplo@example.com'],['andamios','Alquiler de Andamios Central (Ejemplo)','andamios.ejemplo@example.com']];
 for(const [key,name,email] of suppliers)await step('suppliers',name,expAct(`supplier:${key}`),()=>expense(`supplier:${key}`,{action:'supplier',id:id(`supplier:${key}`),name,identification:'',email,phone:'',archived:false}));
 const workExpenses=[
  ['p1','griferia','ferreteria',-12,'Grifería premium para cocina y ducha (Ejemplo)',285000,true,'materials'],
  ['p1','muebles','deposito',-15,'Láminas de melamina y herrajes para muebles (Ejemplo)',742000,false,'materials'],
  ['p2','policarbonato','deposito',-5,'Láminas de policarbonato y tornillería (Ejemplo)',672000,false,'materials'],
  ['p5','cemento','deposito',-30,'Cemento y varilla para fundaciones (Ejemplo)',1240000,false,'materials'],
  ['p5','andamios','andamios',-18,'Alquiler de andamios por dos semanas (Ejemplo)',180000,true,'equipment'],
  ['p5','electrica','electro',-8,'Subcontrato de canalización eléctrica, primera etapa (Ejemplo)',950000,false,'subcontract'],
 ];
 const costsPage=k=>rpc('pro_work_costs_read',{p_user:owner,p_client:P[k].clientId,p_work:P[k].workId,p_kind:'entries',p_search:'',p_after:null});
 const workCost=async(k,requestId,input)=>{const page=await costsPage(k);const parsed=app.workCostMutationSchema.parse({clientId:P[k].clientId,workId:P[k].workId,requestId,revision:page.revision,...input});
  await rpc(parsed.action==='create_expense'?'pro_work_cost_expense_create':'pro_work_costs_mutate',{p_user:owner,p_input:parsed});};
 for(const [k,key,supplier,day,concept,amount,billable,category] of workExpenses)
  await step('expenses',concept,['pro_work_cost_requests','user_id','request_id',id(`cost:${key}`)],async()=>{const page=await costsPage(k);
   await workCost(k,id(`cost:${key}`),{action:'create_expense',expenseId:id(`expense:${key}`),supplierId:id(`supplier:${supplier}`),date:past(day),concept,amountCents:C(amount),expenseRevision:page.expenseRevision,
    billable,paymentMethod:'transfer',vatRateBps:1300,category});});
 await step('expenses','gasto general sin proyecto',expAct('expense:combustible'),()=>expense('expense:combustible',{action:'expense',id:id('expense:combustible'),supplierId:id('supplier:ferreteria'),
  date:past(-4),dueDate:null,currency:'CRC',concept:'Combustible del vehículo de obra, semana 47 (Ejemplo)',amountCents:C(45000),billable:false,paymentMethod:'card',vatRateBps:null,category:'transport'}));
 await step('expensePayments','abono a cemento y varilla',expAct('pay:cemento'),()=>expense('pay:cemento',{action:'payment',expenseId:id('expense:cemento'),amountCents:C(600000),date:past(-20),method:'transfer',reference:'TRF-458812',note:'Primer abono al depósito (Ejemplo)'}));
 await step('expensePayments','pago total de grifería',expAct('pay:griferia'),()=>expense('pay:griferia',{action:'payment',expenseId:id('expense:griferia'),amountCents:C(285000),date:past(-11),method:'card',reference:'',note:'Pagado con tarjeta de la empresa (Ejemplo)'}));
 for(const [k,key,day,minutes,rate,note] of [['p1','demolicion',-19,480,3500,'Demolición de cocina existente (Ejemplo)'],['p1','fontaneria',-14,360,4500,'Fontanería del baño principal (Ejemplo)'],
  ['p5','armado',-25,960,3500,'Armado de acero de fundaciones, dos personas (Ejemplo)'],['p2','estructura',-4,420,4000,'Montaje de estructura metálica (Ejemplo)']])
  await step('workTime',note,['pro_work_cost_requests','user_id','request_id',id(`time:${key}`)],()=>workCost(k,id(`time:${key}`),{action:'add_time',date:past(day),minutes,hourlyCostCents:C(rate),note}));

 // 5. Payable (Finanzas → Cuentas por pagar): supplier bill number on the open cement expense (expense dates live in Expenses).
 await step('payables','factura del depósito',['pro_payable_actions','owner_id','action_id',id('payable:cemento')],async()=>{
  const bill=await must('bill',db.from('pro_payable_bills').select('revision').eq('owner_id',owner).eq('source_kind','expense').eq('expense_id',id('expense:cemento')).maybeSingle());
  await rpc('pro_payables_mutate',{p_actor:owner,p_input:app.payableMutationSchema.parse({action:'save',actionId:id('payable:cemento'),sourceKind:'expense',sourceId:id('expense:cemento'),revision:bill?.revision??0,
   billNumber:'FE-00104582',billDate:null,dueDate:null,note:'Saldo a 40 días según acuerdo con el depósito (Ejemplo).'})});});

 // 6. Invoice drafts (Finanzas → Facturas; Proyecto → Facturas): internal drafts from each project's accepted quote.
 const drafts={};
 for(const [k,title,prep] of [
  ['p1','Factura de avance: cocina y baño (Ejemplo)',{plannedDate:past(-2),saleCondition:'credit',creditDays:15,paymentMethod:'transfer',orderReference:'OC-ROJAS-01'}],
  ['p2','Factura: terraza techada (Ejemplo)',null],
  ['p4','Factura final: mantenimiento anual (Ejemplo)',{plannedDate:past(-45),saleCondition:'cash',creditDays:0,paymentMethod:'transfer',orderReference:'ADM-VR-2026'}],
 ]){
  const source=await rpc('pro_invoice_fiscal_source',{p_user:owner,p_kind:'work',p_id:P[k].workId});
  count('invoiceDrafts');drafts[k]=source?.existingId??null;
  if(drafts[k]){tally.done++;continue;}
  if(!apply||!source){tally.planned++;continue;}
  try{
   const {canton,district,province,neighborhood,activity,identificationType,...receiver}=source.receiver;
   const preparation=prep&&{issuerName:'',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:'',issuerActivity:'',...prep};
   drafts[k]=await rpc('pro_invoice_extras_save',{p_user:owner,p_input:app.invoiceMutationSchema.parse({action:'create',kind:'work',sourceId:P[k].workId,clientId:P[k].clientId,fingerprint:source.fingerprint,
    title,notes:'Documento interno de ejemplo; no es un comprobante electrónico.',receiver,...(preparation?{preparation}:{})})});
   tally.created++;log('finance',`invoiceDrafts: ${title}`);
  }catch(error){tally.skipped++;log('finance',`invoiceDrafts: SKIPPED ${title}: ${why(error)}`);}
 }
 const directId=id('invoice:direct:c3');
 await step('invoiceDrafts','visita técnica (directa)',['pro_invoice_drafts','user_id','id',directId],()=>rpc('pro_invoice_extras_save',{p_user:owner,p_input:app.invoiceMutationSchema.parse({action:'create_direct',requestId:directId,
  clientId:tid('c3'),title:'Visita técnica y levantamiento del local (Ejemplo)',notes:'Documento interno de ejemplo.',lines:[{kind:'service',productId:null,sku:'SRV-VIS',description:'Visita técnica y levantamiento (Ejemplo)',
   unit:'visita',cabys:'',quantity:'1',unitPrice:'25000',discountType:'percent',discount:'0',discountReason:'',taxTreatment:'vat',taxRate:'13'}]})}));

 // 7. Invoice payments (Factura → Pagos): apply the ledger payments already received to the drafts.
 for(const [k,key,entryKey,share] of [['p4','apply:p4','pay:p4:total',1],['p1','apply:p1','pay:p1:anticipo',1]]){
  await step('invoicePayments',`pago aplicado ${k}`,['pro_invoice_payment_requests','user_id','request_id',id(key)],async()=>{
   if(!drafts[k])throw new Error('draft missing');
   const page=await rpc('pro_invoice_payments_read',{p_user:owner,p_id:drafts[k],p_after:null,p_candidates_after:null});
   const candidate=page.candidates.find(c=>c.entryId===id(entryKey));if(!candidate)throw new Error('ledger payment not available');
   const amountCents=Math.min(Math.round(candidate.availableCents*share),page.summary.balanceCents);
   await rpc('pro_invoice_payment_mutate',{p_user:owner,p_input:app.invoicePaymentMutation.parse({action:'apply',requestId:id(key),draftId:drafts[k],draftRevision:page.draft.revision,revision:page.revision,
    source:'existing',candidateId:candidate.id,amountCents,receivedOn:candidate.receivedOn??past(-1),method:candidate.method??'transfer',reference:candidate.reference??''})});});
 }

 // 8. Credits and retainers (Proyecto → Créditos y anticipos): retainer on p5 (requested, then received), credit note on p1 applied to its draft.
 const credit=(key,input)=>rpc('pro_credits_mutate',{p_actor:owner,p_input:app.creditMutationSchema.parse({actionId:id(`credit:${key}`),...input})});
 const crAct=key=>['pro_credit_actions','actor_id','action_id',id(`credit:${key}`)];
 const creditRev=async cid=>(await must('credit',db.from('pro_credits').select('revision').eq('owner_id',owner).eq('id',cid).single())).revision;
 const retainer=id('credit-doc:p5-anticipo'),note=id('credit-doc:p1-nc');
 await step('credits','anticipo p5 solicitado',crAct('retainer:create'),()=>credit('retainer:create',{action:'create_retainer',workId:P.p5.workId,id:retainer,title:'Anticipo para compra de materiales de techo (Ejemplo)',
  amountCents:C(5000000),requestedOn:past(-12),note:'Se solicita antes de pedir la cubierta y el cielo raso.'}));
 await step('credits','anticipo p5 recibido',crAct('retainer:receive'),async()=>credit('retainer:receive',{action:'receive_retainer',workId:P.p5.workId,id:retainer,revision:await creditRev(retainer),
  source:'manual',entryId:null,amountCents:C(5000000),receivedOn:past(-8),method:'sinpe',reference:'SINPE-77120456'}));
 await step('credits','nota de crédito p1',crAct('note:create'),()=>credit('note:create',{action:'create_credit_note',workId:P.p1.workId,id:note,title:'Nota de crédito por cambio de modelo de mueble (Ejemplo)',
  amountCents:C(120000),reason:'El cliente eligió un mueble de baño de menor precio.',note:null}));
 await step('credits','nota de crédito aplicada a la factura p1',crAct('note:apply'),async()=>{if(!drafts.p1)throw new Error('draft missing');
  await credit('note:apply',{action:'apply',workId:P.p1.workId,id:note,revision:await creditRev(note),draftId:drafts.p1,amountCents:C(120000)});});

 // 9. Payment plan (Proyecto → Plan de pagos) on p5 for the open balance; installment 1 becomes an invoice draft. No reminders.
 const planId=id('plan:p5'),plan=(key,input)=>rpc('pro_payment_plan_mutate',{p_actor:owner,p_input:app.paymentPlanMutationSchema.parse({actionId:id(`plan:${key}`),workId:P.p5.workId,planId,...input})});
 await step('paymentPlan','plan de 4 cuotas mensuales',['pro_payment_plan_actions','actor_id','action_id',id('plan:create')],async()=>{
  const account=await rpc('pro_work_account',{p_user:owner,p_work:P.p5.workId});
  await plan('create',{action:'create',totalCents:Math.floor(account.balanceCents/10000)*10000,downPaymentCents:0,downPaymentDate:null,schedule:{mode:'auto',frequency:'monthly',count:4,firstDue:crDate(anchor,5)},
   feeCents:0,lateFeeCents:0,terms:'Cuotas mensuales según avance de obra. Pagos por transferencia o SINPE (Ejemplo).'});});
 await step('paymentPlan','factura de la cuota 1',['pro_payment_plan_actions','actor_id','action_id',id('plan:invoice1')],async()=>{
  const row=await must('plan',db.from('pro_payment_plans').select('revision').eq('owner_id',owner).eq('id',planId).single());
  await plan('invoice1',{action:'invoice',revision:row.revision,seq:1,language:'es'});});

 // Work budget (cost codes, budget lines) is left to its own tool: it needs cost codes and sync state; not seeded here.
 log('finance',`${tally.created} written, ${tally.done} already present, ${tally.planned} planned (dry run), ${tally.skipped} skipped`);
}
