import { z } from 'zod';
import { socialRequestSchema } from './social';
import { validateWork, type WorkItem } from './workspace';
import { isValidId } from '../cedula';
const text=z.string().trim().min(1).max(160);
const optionalText=(max:number)=>z.string().trim().max(max).optional();
export const clientSchema=z.object({id:text,name:text,email:z.union([z.literal(''),z.string().email()]),phone:z.string().max(30),notes:z.string().max(2000),archived:z.boolean(),identification:z.string().refine(v=>!v||isValidId(v),'Revise la identificación.').transform(v=>v.replace(/[\s-]/g,'')).optional(),tradeName:optionalText(160),group:optionalText(80),address:optionalText(500)});
export const productSchema=z.object({id:text,sku:text,name:text,stock:z.number().finite().nonnegative(),minimum:z.number().finite().nonnegative(),cost:z.number().finite().nonnegative(),price:z.number().finite().nonnegative(),archived:z.boolean(),category:optionalText(80),unit:optionalText(30),cabys:z.string().regex(/^(?:\d{13})?$/,'CABYS debe tener 13 dígitos.').optional(),itemType:z.enum(['product','service']).optional()}).superRefine((row,ctx)=>{if(row.itemType==='service'&&(row.stock!==0||row.minimum!==0))ctx.addIssue({code:'custom',path:['stock'],message:'Los servicios no utilizan existencias ni mínimo de inventario.'});});
const lineSchema=z.object({description:text,quantity:z.number().finite().positive().max(100000),price:z.number().finite().nonnegative().max(100000000),tax:z.number().finite().min(0).max(100)});
export const quoteSchema=z.object({id:text,clientId:text,title:text,lines:z.array(lineSchema).min(1).max(100),status:z.enum(['draft','accepted','declined']),validUntil:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});
const slotTime=z.string().datetime({offset:true}).transform(value=>new Date(Date.parse(value)-6*3600000).toISOString().slice(0,19)+"-06:00");
export const availabilitySlotSchema=z.object({start:slotTime,end:slotTime}).refine(s=>Date.parse(s.end)>Date.parse(s.start)&&Date.parse(s.end)-Date.parse(s.start)<=8*3600000,"Horario inválido");
const workSchema=z.object({id:text,client:text,service:text,stage:z.enum(['new','quoting','scheduled','completed']),start:z.string(),end:z.string(),clientId:text,quoteId:z.string().optional(),externalQuoteId:z.string().uuid().optional(),cancelled:z.boolean(),bookingClientId:z.string().uuid().optional()});
const movementSchema=z.object({id:text,productId:text,delta:z.number().finite(),reason:text,at:z.string()});
export const businessSchema=z.object({version:z.literal(1),availability:z.array(availabilitySlotSchema).max(1000).default([]),clients:z.array(clientSchema),products:z.array(productSchema),quotes:z.array(quoteSchema),work:z.array(workSchema),movements:z.array(movementSchema),social:z.array(socialRequestSchema).default([]),quoteLinks:z.array(z.object({quoteId:z.string().uuid(),clientId:text})).default([])});
export type Client=z.infer<typeof clientSchema>;
export type Product=z.infer<typeof productSchema>;
export type Quote=z.infer<typeof quoteSchema>;
export type Business=z.infer<typeof businessSchema>;
export const emptyBusiness=():Business=>({version:1,availability:[],clients:[],products:[],quotes:[],work:[],movements:[],social:[],quoteLinks:[]});
export function quoteTotal(lines:Quote['lines']) {
  return lines.reduce((sum,line)=>{const net=Math.round(line.quantity*line.price*100);return sum+net+Math.round(net*line.tax/100);},0)/100;
}
export function saveClient(state:Business,input:Client):Business {
 const row=clientSchema.parse(input);if(row.identification&&state.clients.some(c=>c.id!==row.id&&c.identification===row.identification))throw Error('Esa identificación ya existe.');return {...state,clients:[...state.clients.filter(c=>c.id!==row.id),row]};
}
export function saveProduct(state:Business,input:Product):Business {
 let row=productSchema.parse(input);
 const old=state.products.find(p=>p.id===row.id);
 if(old&&row.itemType===undefined&&old.itemType!==undefined)row=productSchema.parse({...row,itemType:old.itemType});
 if(old&&(old.itemType??'product')!==(row.itemType??'product'))throw Error('El tipo de artículo o servicio no se puede cambiar después de crearlo.');
 if(state.products.some(p=>p.id!==row.id&&p.sku.toLowerCase()===row.sku.toLowerCase()))throw Error('Ese código de producto ya existe.');
 const previous=state.products.find(p=>p.id===row.id);
 if(previous&&previous.stock!==row.stock)throw Error('Cambie las existencias mediante un movimiento.');
 return {...state,products:[...state.products.filter(p=>p.id!==row.id),row]};
}
export function moveStock(state:Business,productId:string,delta:number,reason:string,id:string,at:string):Business {
 if(state.movements.some(m=>m.id===id))return state;
 const p=state.products.find(p=>p.id===productId&&!p.archived);
 if(!p||p.itemType==='service'||!Number.isFinite(delta)||delta===0||!reason.trim()||p.stock+delta<0)throw Error('Revise producto, cantidad y motivo. No se permiten existencias negativas.');
 return businessSchema.parse({...state,products:state.products.map(p=>p.id===productId?{...p,stock:Math.round((p.stock+delta)*1000)/1000}:p),movements:[...state.movements,{id,productId,delta,reason,at}]});
}
export function saveQuote(state:Business,input:Quote):Business {
 const row=quoteSchema.parse(input);
 if(!state.clients.some(c=>c.id===row.clientId&&!c.archived))throw Error('Seleccione un cliente activo.');
 const previous=state.quotes.find(q=>q.id===row.id);
 if(previous&&previous.status!=='draft')throw Error('Una cotización resuelta no se puede modificar.');
 return {...state,quotes:[...state.quotes.filter(q=>q.id!==row.id),row]};
}
export function saveAppointment(state:Business,input:Business['work'][number]):Business {
 const row=workSchema.parse(input);const client=state.clients.find(c=>c.id===row.clientId&&!c.archived);
 if(!client&&!state.work.some(w=>w.id===row.id&&w.clientId===row.clientId))throw Error('Seleccione un cliente activo.');
 if(row.quoteId&&!state.quotes.some(q=>q.id===row.quoteId&&q.clientId===row.clientId&&q.status==='accepted'))throw Error('La cotización debe estar aceptada y pertenecer a este cliente.');
 if(row.externalQuoteId&&!state.quoteLinks.some(l=>l.quoteId===row.externalQuoteId&&l.clientId===row.clientId))throw Error('La cotización no pertenece a este cliente.');
 const problem=validateWork(row,state.work.filter(w=>!w.cancelled) as WorkItem[]);
 if(!row.cancelled&&problem)throw Error(problem);
 return {...state,work:[...state.work.filter(w=>w.id!==row.id),{...row,client:client?.name||row.client}]};
}
export function costaRicaDate(value:string){return value?`${value}:00-06:00`:'';}
