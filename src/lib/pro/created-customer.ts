/**
 * Round 4B: «Agregar cliente» from a lead opens Clientes › Nuevo cliente in another section. The
 * lead draft survives in sessionStorage, but the customer created there was not chosen on return.
 * The lead marks that it is waiting for a customer; the customer editor records the id it created
 * only when such a mark exists (same account, same tab, at most two hours old); the lead takes it
 * once on return. sessionStorage only: nothing is sent or stored on the server.
 */
const key=(actor:string)=>'ccr:pro:customer-return:v1:'+actor;
const MAX_AGE=2*60*60*1000;
type Mark={at:number;id?:string};
function read(actor:string):Mark|null{
 try{const raw=sessionStorage.getItem(key(actor));if(!raw)return null;const value=JSON.parse(raw) as Mark;
  if(typeof value?.at!=='number'||Date.now()-value.at>MAX_AGE||value.id!==undefined&&(typeof value.id!=='string'||value.id.length<1||value.id.length>160)){sessionStorage.removeItem(key(actor));return null;}
  return value;}catch{return null;}
}
export function awaitCreatedCustomer(actor:string){try{sessionStorage.setItem(key(actor),JSON.stringify({at:Date.now()}));}catch{/* the draft still works; the customer is chosen by hand */}}
export function recordCreatedCustomer(actor:string,id:string){const mark=read(actor);if(!mark||mark.id)return;try{sessionStorage.setItem(key(actor),JSON.stringify({at:mark.at,id}));}catch{/* optional convenience */}}
export function takeCreatedCustomer(actor:string):string|null{const mark=read(actor);if(!mark?.id)return null;try{sessionStorage.removeItem(key(actor));}catch{/* ignore */}return mark.id;}
