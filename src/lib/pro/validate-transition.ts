import { businessSchema, type Business } from './business';
import { validateWork } from './workspace';
/** Checks the full submitted document; a client cannot bypass the form rules. */
export function validateWorkspaceTransition(previous: Business, input: Business): Business {
 const next=businessSchema.parse(input);
 for(const slot of next.availability){if(Date.parse(slot.end)<=Date.parse(slot.start)||Date.parse(slot.end)-Date.parse(slot.start)>8*3600000)throw Error("Horario inválido.");}
 if(new Set(next.availability.map(s=>s.start)).size!==next.availability.length)throw Error("Horario duplicado.");
 for(const old of previous.work){if(old.bookingClientId!==next.work.find(w=>w.id===old.id)?.bookingClientId)throw Error("No se puede cambiar el cliente de una reserva.");}
 for(const key of ['clients','products','quotes','work','movements'] as const){
  if(next[key].length>10000)throw Error('Demasiados registros.');
  if(new Set(next[key].map(r=>r.id)).size!==next[key].length)throw Error('Identificadores duplicados.');
  if(previous[key].some(old=>!next[key].some(r=>r.id===old.id)))throw Error('Archive o cancele los registros; no se permite borrar el historial.');
 }
 const clientIds=next.clients.map(c=>c.identification).filter(Boolean);
 if(new Set(clientIds).size!==clientIds.length)throw Error('Identificación de cliente duplicada.');
 if(new Set(next.products.map(p=>p.sku.toLowerCase())).size!==next.products.length)throw Error('Código de producto duplicado.');
 for(const movement of previous.movements){if(JSON.stringify(next.movements.find(m=>m.id===movement.id))!==JSON.stringify(movement))throw Error('No se puede modificar el historial de inventario.');}
 for(const movement of next.movements)if(!next.products.some(p=>p.id===movement.productId)||movement.delta===0)throw Error('Movimiento inválido.');
 for(const product of next.products){
  const old=previous.products.find(p=>p.id===product.id);
  const added=next.movements.filter(m=>m.productId===product.id&&!previous.movements.some(p=>p.id===m.id));
  if(old&&Math.abs(product.stock-Math.round((old.stock+added.reduce((n,m)=>n+m.delta,0))*1000)/1000)>0.00001)throw Error('Las existencias deben coincidir con los movimientos.');
 }
 for(const quote of next.quotes){
  if(!next.clients.some(c=>c.id===quote.clientId))throw Error('Cliente de cotización inexistente.');
  const old=previous.quotes.find(q=>q.id===quote.id);
  if(old&&old.status!=='draft'&&JSON.stringify(old)!==JSON.stringify(quote))throw Error('Una cotización resuelta no puede modificarse.');
 }
 if(new Set(next.quoteLinks.map(l=>l.quoteId)).size!==next.quoteLinks.length)throw Error('Cotización vinculada dos veces.');
 for(const link of next.quoteLinks)if(!next.clients.some(c=>c.id===link.clientId))throw Error('Cliente vinculado inexistente.');
 for(const link of previous.quoteLinks)if(!next.quoteLinks.some(l=>l.quoteId===link.quoteId&&l.clientId===link.clientId))throw Error('No se puede cambiar el cliente de una cotización vinculada.');
 for(const work of next.work){
  if(work.externalQuoteId&&!next.quoteLinks.some(l=>l.quoteId===work.externalQuoteId&&l.clientId===work.clientId))throw Error('Cotización de cita inválida.');
  if(!next.clients.some(c=>c.id===work.clientId))throw Error('Cliente de cita inexistente.');
  if(work.quoteId&&!next.quotes.some(q=>q.id===work.quoteId&&q.clientId===work.clientId&&q.status==='accepted'))throw Error('Cotización de cita inválida.');
  if(!work.cancelled){const problem=validateWork(work,next.work.filter(w=>!w.cancelled));if(problem)throw Error(problem);}
 }
 return {...next,social:[]};
}
