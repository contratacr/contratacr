/** Area D: pure helpers shared by the money lists (quotes, change orders, purchase orders, invoices): summary cards and filters. */
export type MoneyByCurrency=Record<string,number>;
export function addMoney(into:MoneyByCurrency,currency:string,cents:number){into[currency]=(into[currency]??0)+cents;return into;}
export function matchesText(haystack:ReadonlyArray<string|null|undefined>,query:string){
 const needle=query.trim().toLocaleLowerCase('es');if(!needle)return true;
 return haystack.some(part=>!!part&&part.toLocaleLowerCase('es').includes(needle));
}
type EstimateLike={title:string;clientName:string;status:string;currency:string;totalCents:number};
export type EstimateFilter='all'|'draft'|'sent'|'accepted'|'closed';
/** «closed» groups declined and withdrawn quotes. */
export function estimateGroup(status:string):Exclude<EstimateFilter,'all'>{return status==='draft'||status==='sent'||status==='accepted'?status:'closed';}
export function filterEstimates<T extends EstimateLike>(items:readonly T[],filter:EstimateFilter,query:string){
 return items.filter(item=>(filter==='all'||estimateGroup(item.status)===filter)&&matchesText([item.title,item.clientName],query));
}
export function summarizeEstimates(items:readonly EstimateLike[]){
 const total:MoneyByCurrency={},accepted:MoneyByCurrency={},awaiting:MoneyByCurrency={};const counts={all:items.length,draft:0,sent:0,accepted:0,closed:0};
 for(const item of items){const group=estimateGroup(item.status);counts[group]++;addMoney(total,item.currency,item.totalCents);
  if(group==='accepted')addMoney(accepted,item.currency,item.totalCents);if(group==='sent')addMoney(awaiting,item.currency,item.totalCents);}
 return {total,accepted,awaiting,counts};
}
type ChangeLike={status:string;deltaCents:number;reason:string;stale?:boolean};
export type ChangeFilter='all'|'proposed'|'accepted'|'closed';
export function changeGroup(status:string):Exclude<ChangeFilter,'all'>{return status==='proposed'||status==='accepted'?status:'closed';}
export function filterChanges<T extends ChangeLike>(items:readonly T[],filter:ChangeFilter,query:string){
 return items.filter(item=>(filter==='all'||changeGroup(item.status)===filter)&&matchesText([item.reason],query));
}
/** Cards for change orders: approved total, awaiting approval, closed (declined or withdrawn) and the job balance. */
export function summarizeChanges(items:readonly ChangeLike[],balanceCents:number|null){
 let approved=0,awaiting=0;const counts={all:items.length,proposed:0,accepted:0,closed:0};
 for(const item of items){const group=changeGroup(item.status);counts[group]++;if(group==='accepted')approved+=item.deltaCents;if(group==='proposed')awaiting+=item.deltaCents;}
 return {approved,awaiting,balance:balanceCents,counts};
}
