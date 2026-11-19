import {z} from 'zod';
import {formatMinutes} from './time-tracking';
/**
 * Round 10 (local Pro suite): shared schemas and pure helpers for contacts import/organization,
 * pipeline board and outcomes, conversion by channel, schedule links (FS/SS + lag, shift, undo,
 * critical path), combined schedule, daily log autofill (mock weather), template assignee mapping,
 * selections tracking/margin and the printable documents. No network calls here.
 */
const id=z.string().uuid();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nint=z.number().int().nonnegative();
// ===== Contacts =====
export const contactFields=['name','email','phone','identification','tradeName','group','address','notes','tags'] as const;
export type ContactField=typeof contactFields[number];
export type ContactRow=Partial<Record<Exclude<ContactField,'tags'>,string>>&{tags?:string[]};
export const contactPreviewSchema=z.object({rows:z.array(z.object({index:nint,status:z.enum(['new','duplicate','duplicate_in_file','invalid']),issues:z.array(z.string()),
 row:z.object({name:z.string(),email:z.string(),phone:z.string(),identification:z.string(),tradeName:z.string(),group:z.string(),address:z.string(),notes:z.string(),tags:z.array(z.string())}),
 match:z.object({id:z.string(),name:z.string(),by:z.enum(['email','phone'])}).nullable()})).max(500),
 counts:z.object({total:nint,new:nint,duplicate:nint,duplicateInFile:nint,invalid:nint})});
export type ContactPreview=z.infer<typeof contactPreviewSchema>;
export const contactsReadSchema=z.object({revision:nint,tags:z.record(z.string(),z.array(z.string())),tagCounts:z.array(z.object({tag:z.string(),count:nint})),
 merges:z.array(z.object({mergedId:z.string(),keptId:z.string(),mergedName:z.string(),at:z.string()})),
 imports:z.array(z.object({id,fileName:z.string(),format:z.enum(['csv','vcard']),total:nint,created:nint,skipped:nint,at:z.string()})),
 duplicates:z.array(z.object({by:z.enum(['email','phone']),key:z.string(),clients:z.array(z.object({id:z.string(),name:z.string(),email:z.string(),phone:z.string(),records:nint}))}))});
export type ContactsRead=z.infer<typeof contactsReadSchema>;
export const contactExportSchema=z.array(z.object({id:z.string(),name:z.string(),email:z.string(),phone:z.string(),identification:z.string(),tradeName:z.string(),group:z.string(),address:z.string(),notes:z.string(),archived:z.boolean(),tags:z.array(z.string()),mergedInto:z.string().nullable()}));
const contactRowInput=z.object({name:z.string().max(400).optional(),email:z.string().max(400).optional(),phone:z.string().max(100).optional(),identification:z.string().max(100).optional(),tradeName:z.string().max(400).optional(),group:z.string().max(200).optional(),address:z.string().max(1000).optional(),notes:z.string().max(4000).optional(),tags:z.array(z.string().max(100)).max(20).optional()}).strict();
export const contactsInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('preview'),rows:z.array(contactRowInput).min(1).max(500)}).strict(),
 z.object({action:z.literal('import'),actionId:id,revision:nint,fileName:z.string().trim().min(1).max(160),format:z.enum(['csv','vcard']),rows:z.array(contactRowInput).min(1).max(500)}).strict(),
 z.object({action:z.literal('tags'),actionId:id,clientId:z.string().min(1).max(160),tags:z.array(z.string().trim().min(1).max(40)).max(10)}).strict(),
 z.object({action:z.literal('merge'),actionId:id,revision:nint,keepId:z.string().min(1).max(160),mergeId:z.string().min(1).max(160)}).strict(),
]);
export type ContactsInput=z.infer<typeof contactsInputSchema>;
/** RFC-4180-ish CSV parser (quotes, doubled quotes, CR/LF) with «,» or «;» detected on the header line. */
export function parseCsv(text:string):string[][]{
 const clean=text.replace(/^﻿/,''),first=clean.split(/\r?\n/,1)[0]??'',sep=(first.match(/;/g)?.length??0)>(first.match(/,/g)?.length??0)?';':',';
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<clean.length;i++){const ch=clean[i];
  if(quoted){if(ch==='"'){if(clean[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=ch;continue;}
  if(ch==='"')quoted=true;else if(ch===sep){row.push(cell);cell='';}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&clean[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>v.trim()))rows.push(row);row=[];}else cell+=ch;}
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
/** Minimal vCard 2.1/3.0/4.0 reader: FN/N, EMAIL, TEL, ORG, ADR, NOTE, CATEGORIES (unfolded lines). */
export function parseVcards(text:string):ContactRow[]{
 const lines=text.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'').split(/\r?\n/),out:ContactRow[]=[];let cur:ContactRow|null=null,n='';
 const value=(line:string)=>line.slice(line.indexOf(':')+1).replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1').trim();
 for(const line of lines){const key=line.slice(0,line.indexOf(':')).split(';')[0].replace(/^item\d+\./i,'').toUpperCase();
  if(/^BEGIN:VCARD/i.test(line)){cur={};n='';continue;}
  if(/^END:VCARD/i.test(line)){if(cur){if(!cur.name&&n)cur.name=n;out.push(cur);}cur=null;continue;}
  if(!cur||!line.includes(':'))continue;
  if(key==='FN')cur.name=value(line);
  else if(key==='N'){const [last,first]=value(line).split(';');n=[first,last].filter(Boolean).join(' ').trim();}
  else if(key==='EMAIL'&&!cur.email)cur.email=value(line);
  else if(key==='TEL'&&!cur.phone)cur.phone=value(line).replace(/^tel:/i,'');
  else if(key==='ORG'&&!cur.tradeName)cur.tradeName=value(line).split(';')[0];
  else if(key==='ADR'&&!cur.address)cur.address=value(line).split(';').map(v=>v.trim()).filter(Boolean).join(', ');
  else if(key==='NOTE')cur.notes=value(line);
  else if(key==='CATEGORIES')cur.tags=value(line).split(',').map(v=>v.trim()).filter(Boolean).slice(0,10);
 }
 return out;
}
const headerGuess:Record<Exclude<ContactField,'tags'>|'tags',RegExp>={name:/^(nombre|nombre completo|nombre y apellidos?|name|cliente|customer|contacto|full ?name)$/i,email:/^(correo|e-?mail|email address|correo electr[oó]nico)$/i,phone:/^(tel[eé]fono|phone|celular|m[oó]vil|mobile|whatsapp|tel)$/i,
 identification:/^(c[eé]dula|identificaci[oó]n|id|tax ?id)$/i,tradeName:/^(empresa|company|nombre comercial|organization|org)$/i,group:/^(grupo|group|segmento)$/i,address:/^(direcci[oó]n|address)$/i,notes:/^(notas?|notes?|comentarios?)$/i,tags:/^(etiquetas?|tags?|labels?)$/i};
/** Column → field guess from the header names (the person confirms or changes every column). */
export function guessContactMapping(headers:string[]):(ContactField|'')[]{const used=new Set<string>();return headers.map(h=>{const f=(Object.keys(headerGuess) as ContactField[]).find(k=>!used.has(k)&&headerGuess[k].test(h.trim()));if(f)used.add(f);return f??'';});}
export function mapContactRows(rows:string[][],mapping:(ContactField|'')[]):ContactRow[]{
 return rows.map(r=>{const out:ContactRow={};mapping.forEach((f,i)=>{const v=(r[i]??'').trim();if(!f||!v)return;if(f==='tags')out.tags=[...(out.tags??[]),...v.split(/[;,|]/).map(t=>t.trim()).filter(Boolean)].slice(0,10);else if(!out[f])out[f]=v;});return out;});
}
/** CSV for Excel: «;» separator, BOM, formulas neutralised. */
export function excelCsv(header:string[],rows:(string|number|null)[][]){const cell=(v:unknown)=>{const s=String(v??'');return '"'+(/^[\s]*[=+@-]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';};return '﻿'+[header,...rows].map(r=>r.map(cell).join(';')).join('\r\n');}
// ===== Pipeline board, outcomes, conversion =====
export const lostReasons=['price','timing','competitor','no_response','scope','other'] as const;
export const wonReasons=['price','quality','referral','speed','relationship','other'] as const;
/** Fix 13: names of the built-in lead channels (same wording as the lead origin editor). */
export function builtinChannelLabel(key:string,en:boolean){const es:Record<string,string>={direct:'Contacto directo',referral:'Recomendación',website:'Sitio web',social:'Redes sociales',advertising:'Publicidad',other:'Otro'};const english:Record<string,string>={direct:'Direct',referral:'Referral',website:'Website',social:'Social media',advertising:'Advertising',other:'Other'};return (en?english:es)[key]??null;}
export function outcomeReasonLabel(reason:string,en:boolean){const es:Record<string,string>={price:'Precio',timing:'Momento o plazos',competitor:'Eligió a otra empresa',no_response:'No respondió',scope:'Cambió el alcance',quality:'Calidad del trabajo',referral:'Recomendación',speed:'Rapidez de respuesta',relationship:'Buena relación',other:'Otro motivo'};
 const english:Record<string,string>={price:'Price',timing:'Timing',competitor:'Chose another company',no_response:'No response',scope:'Scope changed',quality:'Quality of work',referral:'Referred by someone',speed:'Response speed',relationship:'Relationship',other:'Other reason'};return (en?english:es)[reason]??reason;}
const boardCard=z.object({kind:z.enum(['manual','request']),id,title:z.string(),clientName:z.string(),createdDay:day,channelId:z.string().nullable(),revision:nint,stageMode:z.string(),currency:z.string().nullable(),revenueCents:z.number().int().nullable(),outcome:z.enum(['won','lost']).nullable(),reason:z.string().nullable(),outcomeRevision:nint});
export type BoardCard=z.infer<typeof boardCard>;
export const leadBoardSchema=z.object({catalog:z.object({revision:nint,stages:z.array(z.object({id:z.string(),builtin:z.boolean(),name:z.string().nullable(),position:z.number().int(),hidden:z.boolean(),reassignToId:z.string().nullable()}))}),
 columns:z.array(z.object({stageId:z.string(),count:nint,items:z.array(boardCard)})),lost:nint});
export type LeadBoard=z.infer<typeof leadBoardSchema>;
export const leadBoardInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('move'),actionId:id,kind:z.enum(['manual','request']),id,revision:nint,catalogRevision:nint,stageId:z.string().min(1).max(40)}).strict(),
 z.object({action:z.literal('outcome'),actionId:id,kind:z.enum(['manual','request']),id,revision:nint,outcome:z.enum(['won','lost']).nullable(),reason:z.string().max(20).nullable(),note:z.string().max(300)}).strict(),
]);
export type LeadBoardInput=z.infer<typeof leadBoardInputSchema>;
const funnel={received:nint,meeting:nint,estimate:nint,won:nint,lost:nint,converted:nint};
export const conversionReportSchema=z.object({from:day,to:day,group:z.enum(['channel','campaign']),rows:z.array(z.object({key:z.string(),name:z.string().nullable(),campaignChannel:z.string().nullable(),...funnel,conversionRate:z.number().nullable()})),totals:z.object(funnel),months:z.array(z.object({month:z.string(),received:nint,converted:nint}))});
export type ConversionReport=z.infer<typeof conversionReportSchema>;
// ===== Schedule links =====
export const scheduleLinksSchema=z.object({workId:z.string(),revision:nint,tasks:z.array(z.object({id,title:z.string(),status:z.enum(['open','done']),assignee:z.string(),start:day,end:day,phaseId:id.nullable()})),
 links:z.array(z.object({taskId:id,predecessorId:id,kind:z.enum(['fs','ss']),lagDays:z.number().int(),revision:nint})),
 lastShift:z.object({actionId:id,at:z.string(),moved:nint,undone:z.boolean(),undoable:z.boolean()}).nullable()});
export type ScheduleLinks=z.infer<typeof scheduleLinksSchema>;
export const shiftChangeSchema=z.object({taskId:id,title:z.string().nullable(),fromStart:day,fromEnd:day,toStart:day,toEnd:day,moved:z.boolean().optional()});
export const shiftPreviewSchema=z.object({revision:nint,changes:z.array(shiftChangeSchema)});
export const scheduleInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('link_set'),actionId:id,workId:z.string().min(1).max(160),taskId:id,predecessorId:id,kind:z.enum(['fs','ss']),lagDays:z.number().int().min(-60).max(365),revision:nint}).strict(),
 z.object({action:z.literal('shift'),actionId:id,workId:z.string().min(1).max(160),taskId:id,start:day,end:day,revision:nint}).strict(),
 z.object({action:z.literal('undo'),actionId:id,workId:z.string().min(1).max(160),shiftId:id,revision:nint}).strict(),
]);
export type ScheduleInput=z.infer<typeof scheduleInputSchema>;
const dnum=(d:string)=>Math.round(Date.parse(d+'T12:00:00Z')/86400000);
/**
 * Driving (critical) path on actual planned dates: from the task(s) that finish last, walk back through
 * predecessors whose rule is tight (successor starts exactly when the FS/SS + lag rule allows).
 */
export function criticalPath(data:Pick<ScheduleLinks,'tasks'|'links'>):Set<string>{
 const byId=new Map(data.tasks.map(t=>[t.id,t])),out=new Set<string>();if(!data.tasks.length)return out;
 const last=Math.max(...data.tasks.map(t=>dnum(t.end)));const queue=data.tasks.filter(t=>dnum(t.end)===last).map(t=>t.id);
 while(queue.length){const tid=queue.shift()!;if(out.has(tid))continue;out.add(tid);const t=byId.get(tid)!;
  for(const l of data.links.filter(x=>x.taskId===tid)){const p=byId.get(l.predecessorId);if(!p)continue;const need=l.kind==='fs'?dnum(p.end)+1+l.lagDays:dnum(p.start)+l.lagDays;if(need===dnum(t.start))queue.push(p.id);}}
 return out.size>1?out:new Set<string>();
}
export const multiScheduleSchema=z.object({from:day,to:day,items:z.array(z.object({workId:z.string(),service:z.string(),client:z.string(),taskId:id,title:z.string(),status:z.enum(['open','done']),assignee:z.string(),start:day,end:day,overdue:z.boolean()}))});
export type MultiSchedule=z.infer<typeof multiScheduleSchema>;
// ===== Daily log autofill =====
export const autofillSchema=z.object({workId:z.string(),date:day,crew:z.object({people:z.array(z.object({key:z.string(),name:z.string(),minutes:nint})),count:nint,minutes:nint}),completed:z.array(z.object({id,title:z.string()})),planned:z.array(z.object({id,title:z.string()})),existing:z.boolean(),
 weather:z.object({condition:z.enum(['clear','cloudy','rain','other']),temperatureC:z.number(),note:z.string(),source:z.literal('mock')})});
export type Autofill=z.infer<typeof autofillSchema>;
/**
 * Weather adapter. Only a deterministic MOCK exists (no provider is configured or called): the same
 * job and date always give the same «sample» weather, clearly labelled as simulated in the screen.
 */
export function mockWeather(workId:string,date:string,en:boolean){let h=0;for(const ch of workId+'|'+date)h=(h*31+ch.charCodeAt(0))>>>0;const options=['clear','cloudy','rain','clear','cloudy'] as const,condition=options[h%options.length];
 return {condition,temperatureC:21+(h>>>3)%9,note:en?'Sample weather (simulated, not the real weather)':'Clima de ejemplo (simulado, no es el clima real)',source:'mock' as const};}
export function autofillSummary(a:Autofill,en:boolean){const hm=formatMinutes;const lines:string[]=[];
 if(a.completed.length)lines.push((en?'Completed: ':'Completado: ')+a.completed.map(t=>t.title).join(', ')+'.');
 if(a.planned.length)lines.push((en?'In progress: ':'En curso: ')+a.planned.map(t=>t.title).join(', ')+'.');
 if(a.crew.count)lines.push((en?'Crew: ':'Personal: ')+a.crew.people.map(p=>p.minutes?`${p.name} (${hm(p.minutes)})`:p.name).join(', ')+'.');
 return lines.join('\n');}
// ===== Task template mapping =====
export const templateApplyMappedSchema=z.object({action:z.literal('apply'),actionId:id,templateId:id,revision:z.number().int().positive(),workId:z.string().min(1).max(160),startDate:day.nullable(),newTaskIds:z.array(id).min(1).max(100),taskActionIds:z.array(id).min(1).max(100),assigneeMap:z.record(z.string().min(1).max(160),z.string().max(160))}).strict();
// ===== Selections tracking =====
export const trackingStatuses=['not_ordered','ordered','delivered','installed'] as const;
export const selectionTrackingSchema=z.object({workId:z.string(),today:day,items:z.array(z.object({itemId:id,name:z.string(),areaName:z.string(),state:z.string(),revision:nint,approvedOptionId:id.nullable(),recommendedOptionId:id.nullable(),dueDate:day.nullable(),
 tracking:z.object({status:z.enum(trackingStatuses),orderedOn:day.nullable(),deliveredOn:day.nullable(),supplierRef:z.string(),revision:nint}),
 options:z.array(z.object({optionId:id,name:z.string(),quantity:z.number(),unitCents:z.number().int(),totalCents:z.number().int(),unitCostCents:z.number().int().nullable(),costRevision:nint,costCents:z.number().int().nullable(),marginCents:z.number().int().nullable(),marginBps:z.number().int().nullable()}))})),
 totals:z.object({approved:nint,approvedPriceCents:z.number().int(),approvedCostCents:z.number().int(),approvedWithoutCost:nint,marginCents:z.number().int(),notOrdered:nint,ordered:nint,delivered:nint})});
export type SelectionTracking=z.infer<typeof selectionTrackingSchema>;
export const selectionTrackingInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('tracking_set'),actionId:id,workId:z.string().min(1).max(160),itemId:id,revision:nint,status:z.enum(trackingStatuses),orderedOn:day.nullable(),deliveredOn:day.nullable(),supplierRef:z.string().max(80)}).strict(),
 z.object({action:z.literal('bulk_track'),actionId:id,workId:z.string().min(1).max(160),status:z.enum(trackingStatuses),items:z.array(z.object({itemId:id,revision:nint}).strict()).min(1).max(100)}).strict(),
 z.object({action:z.literal('cost_set'),actionId:id,workId:z.string().min(1).max(160),optionId:id,revision:nint,unitCostCents:z.number().int().min(0).max(10000000000).nullable()}).strict(),
 z.object({action:z.literal('approve_many'),actionId:id,requestId:id,items:z.array(z.object({id,optionId:id,revision:z.number().int().positive()}).strict()).min(1).max(50)}).strict(),
]);
export function trackingLabel(status:string,en:boolean){return ({not_ordered:en?'Not ordered':'Sin pedir',ordered:en?'Ordered':'Pedido',delivered:en?'Delivered':'Entregado',installed:en?'Installed':'Instalado'} as Record<string,string>)[status]??status;}
// ===== Printable documents =====
export const selectionPrintSchema=z.object({workId:z.string(),service:z.string(),client:z.string(),today:day,areas:z.array(z.object({name:z.string(),items:z.array(z.object({name:z.string(),state:z.string(),dueDate:day.nullable(),approvedAt:z.string().nullable(),tracking:z.string(),
 priceHidden:z.boolean().optional(),/* Round 12: «hide price» per item is respected in print */
 option:z.object({name:z.string(),brand:z.string().nullable(),quantity:z.number(),unitCents:z.number().int().nullable(),totalCents:z.number().int().nullable(),approved:z.boolean()}).nullable(),optionCount:nint}))}))});
export const changePrintSchema=z.object({id,number:z.number().int().positive(),workId:z.string(),service:z.string(),client:z.string(),reason:z.string(),status:z.enum(['proposed','accepted','declined','withdrawn']),recordedBy:z.string().nullable(),acceptanceNote:z.string(),
 lines:z.array(z.object({description:z.string(),amountCents:z.number().int()})),baseCents:z.number().int(),deltaCents:z.number().int(),totalCents:z.number().int(),scheduleDays:z.number().int(),createdAt:z.string(),updatedAt:z.string()});
