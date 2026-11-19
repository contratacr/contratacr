import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
import {clientWriteInputSchema,clientWriteAckSchema} from '@/lib/pro/client-write-recovery';
import {inventoryWriteInputSchema,inventoryWriteAckSchema} from '@/lib/pro/inventory-write-recovery';
import {readClientRecord,readProductRecord} from '@/lib/pro/catalog-records';
import { z } from 'zod';
import { proApiAccess, proDbFailure } from '@/lib/pro/api-access';
import { businessSchema, clientSchema, productSchema, emptyBusiness } from '@/lib/pro/business';
const headers = { 'Cache-Control': 'no-store' };
function expectedActor(req:Request,actorId:string){
  const expected=req.headers.get('x-pro-expected-actor');if(expected===null)return null;
  if(!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''))return Response.json({error:'No disponible'},{status:404,headers});
  if(!z.string().uuid().safeParse(expected).success)return Response.json({error:'Cuenta inválida'},{status:400,headers});
  return expected===actorId?null:Response.json({error:'La cuenta cambió. Vuelva a la cuenta del intento guardado.'},{status:403,headers});
}

const kindSchema = z.enum(['clients', 'products', 'movements']);
const querySchema = z.object({ kind: kindSchema, q: z.string().max(160).default(''), filter: z.enum(['all', 'archived', 'low']).default('all'), after: z.string().max(1000).default(''), id: z.string().max(160).optional(), option:z.literal('1').optional(), history:z.literal('1').optional(),itemType:z.enum(['all','product','service']).default('all'),inventoryMovement:z.string().uuid().optional(),inventoryActionId:z.string().uuid().optional() });
export async function GET(req: Request) {
  const access = await proApiAccess(req); if (access.error) return access.error;
  const scopeError=expectedActor(req,access.user.id);if(scopeError)return scopeError;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: 'Consulta inválida' }, { status: 400, headers });
  const { kind, q, filter, after, id, option, history,itemType,inventoryMovement,inventoryActionId } = parsed.data;
  if(inventoryMovement||inventoryActionId){
    if(!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''))return Response.json({error:'No disponible'},{status:404,headers});
    if(!inventoryMovement||!inventoryActionId||kind!=='products'||!id||option!=='1'||history||after)return Response.json({error:'Consulta inválida'},{status:400,headers});
  }
  if(history && (kind!=='clients' || !id)) return Response.json({error:'Consulta inválida'},{status:400,headers});
  if (kind === 'movements' && (id || after && !/^\d{1,18}$/.test(after))) return Response.json({ error: 'Consulta inválida' }, { status: 400, headers });
  // Read revision before the page. A concurrent write causes a safe CAS conflict, never a lost update.
  const core = await access.db.from('pro_workspace_core').select('revision').eq('user_id', access.user.id).maybeSingle();
  if (core.error) return proDbFailure(core.error);
  if (id) {
    const row = await access.db.from(`pro_${kind}`).select('*').eq('user_id', access.user.id).eq('id', id).maybeSingle();
    if (row.error) return proDbFailure(row.error);
    if (!row.data||kind==='products'&&itemType!=='all'&&(row.data.itemType??'product')!==itemType) return Response.json({ error: 'Registro no encontrado' }, { status: 404, headers });
    if(history){
      let cursor;
      try{cursor=decodeCursor(after,z.object({at:z.string().max(40),key:z.string().min(1).max(180)}));}catch{return Response.json({error:'Consulta inválida'},{status:400,headers});}
      const page=await access.db.rpc('pro_client_history_page',{p_user:access.user.id,p_client:id,p_after:cursor});
      if(page.error)return proDbFailure(page.error);
      return Response.json({...page.data,nextCursor:encodeCursor(page.data.nextCursor),revision:core.data?.revision??0,userId:access.user.id},{headers});
    }
    const document = emptyBusiness();
    if (kind === 'clients') {
      document.clients = [readClientRecord(row.data)];
      if(!option){
        const context=await access.db.rpc('pro_client_history',{p_user:access.user.id,p_client:id});
        if(context.error)return proDbFailure(context.error);
        document.work=businessSchema.shape.work.parse(context.data.work);
        document.quotes=businessSchema.shape.quotes.parse(context.data.quotes);
        document.quoteLinks=businessSchema.shape.quoteLinks.parse(context.data.quoteLinks);
      }
    } else document.products = [readProductRecord(row.data)];
    let movement:unknown;
    if(inventoryMovement&&inventoryActionId){
      // An exact movement read is bound to this actor's confirmed action and product,
      // not a guessed movement UUID or another action's receipt.
      const receipt=await access.db.from('pro_inventory_write_actions').select('input,result').eq('actor_id',access.user.id).eq('action_id',inventoryActionId).maybeSingle();
      if(receipt.error)return proDbFailure(receipt.error);
      if(!receipt.data)return Response.json({error:'Registro no encontrado'},{status:404,headers});
      const input=inventoryWriteInputSchema.safeParse(receipt.data.input),ack=inventoryWriteAckSchema.safeParse(receipt.data.result);
      if(!input.success||!ack.success||ack.data.revision!==input.data.revision+1)return Response.json({error:'No se pudo comprobar el movimiento.'},{status:503,headers});
      if(input.data.inventoryWriteMode!=='movement'||input.data.inventoryActionId!==inventoryActionId||input.data.rows[0].id!==id||input.data.movements[0]?.id!==inventoryMovement||ack.data.id!==id||ack.data.movementId!==inventoryMovement)return Response.json({error:'Registro no encontrado'},{status:404,headers});
      const saved=await access.db.from('pro_movements').select('*').eq('user_id',access.user.id).eq('productId',id).eq('id',inventoryMovement).maybeSingle();
      if(saved.error)return proDbFailure(saved.error);
      const parsedMovement=businessSchema.shape.movements.element.safeParse(saved.data);
      if(!parsedMovement.success||JSON.stringify(parsedMovement.data)!==JSON.stringify(input.data.movements[0]))return Response.json({error:'No se pudo comprobar el movimiento.'},{status:503,headers});
      movement=parsedMovement.data;
    }
    return Response.json({ document, revision: core.data?.revision ?? 0, userId: access.user.id,...(movement?{movement}:{}) }, { headers });
  }
  const page = await access.db.rpc('pro_catalog_page', { p_user: access.user.id, p_kind: kind, p_search: q, p_filter: filter, p_after: after, p_limit: 20,p_item_type:itemType });
  if (page.error) return proDbFailure(page.error);
  return Response.json({ ...page.data, revision: core.data?.revision ?? 0, userId: access.user.id }, { headers });
}
const mutationSchema = z.object({
  kind: z.enum(['clients', 'products']), revision: z.number().int().nonnegative(),
  rows: z.array(z.unknown()).min(1).max(500), movements: businessSchema.shape.movements.max(1).default([]),
  importing: z.boolean().default(false),
});
export async function PATCH(req: Request) {
  const access = await proApiAccess(req); if (access.error) return access.error;
  const scopeError=expectedActor(req,access.user.id);if(scopeError)return scopeError;
  try {
    const raw = await req.json();
    if(raw&&typeof raw==='object'&&('clientActionId' in raw||'clientWriteMode' in raw)){
      // The receipt path is local-only and opt-in; existing imports/stock/archive writers keep their contract.
      if(!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''))return Response.json({error:'No disponible'},{status:404,headers});
      const input=clientWriteInputSchema.parse(raw);
      if(JSON.stringify(input).length>16000)return Response.json({error:'Datos inválidos'},{status:400,headers});
      const saved=await access.db.rpc('pro_client_write_record',{p_actor:access.user.id,p_input:input});
      if(saved.error){
        if(saved.error.code==='23505')return Response.json({error:'Código o identificación duplicados. Revise también los registros archivados.'},{status:400,headers});
        if(['22023','22P02','23514'].includes(saved.error.code??''))return Response.json({error:'Revise el cliente. No se guardó ningún cambio.'},{status:400,headers});
        return proDbFailure(saved.error);
      }
      const ack=clientWriteAckSchema.safeParse(saved.data);
      if(!ack.success||ack.data.id!==input.rows[0].id||ack.data.revision!==input.revision+1)return Response.json({error:'No se pudo comprobar el guardado.'},{status:503,headers});
      return Response.json(ack.data,{headers});
    }
    if(raw&&typeof raw==='object'&&('inventoryActionId' in raw||'inventoryWriteMode' in raw)){
      if(!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''))return Response.json({error:'No disponible'},{status:404,headers});
      const input=inventoryWriteInputSchema.parse(raw);
      if(JSON.stringify(input).length>16000)return Response.json({error:'Datos inválidos'},{status:400,headers});
      const saved=await access.db.rpc('pro_inventory_write_record',{p_actor:access.user.id,p_input:input});
      if(saved.error){
        if(saved.error.code==='23505')return Response.json({error:'Código duplicado. Revise también los registros archivados.'},{status:400,headers});
        if(['22023','22P02','23514'].includes(saved.error.code??''))return Response.json({error:'Revise el producto y el movimiento. No se guardó ningún cambio.'},{status:400,headers});
        return proDbFailure(saved.error);
      }
      const ack=inventoryWriteAckSchema.safeParse(saved.data);
      if(!ack.success||ack.data.id!==input.rows[0].id||ack.data.revision!==input.revision+1||ack.data.movementId!==(input.movements[0]?.id??null))return Response.json({error:'No se pudo comprobar el guardado.'},{status:503,headers});
      return Response.json(ack.data,{headers});
    }
    const input = mutationSchema.parse(raw);
    const rows = input.kind === 'clients' ? z.array(clientSchema).parse(input.rows) : z.array(productSchema).parse(input.rows);
    if (new Set(rows.map(r => r.id)).size !== rows.length) throw Error('Identificadores duplicados.');
    if (input.kind === 'clients' && input.movements.length) throw Error('Movimiento inválido.');
    const saved = await access.db.rpc('pro_mutate_catalog', { p_user: access.user.id, p_kind: input.kind, p_rows: rows, p_revision: input.revision, p_movements: input.movements, p_importing: input.importing });
    if (saved.error) {
      if (saved.error.code === '23505') return Response.json({ error: 'Código o identificación duplicados. Revise también los registros archivados.' }, { status: 400, headers });
      if (saved.error.code === '22023' || saved.error.code === '23514') return Response.json({ error: 'Revise los registros y movimientos. No se guardó ningún cambio.' }, { status: 400, headers });
      return proDbFailure(saved.error);
    }
    return Response.json({ revision: saved.data }, { headers });
  } catch (e) {
    return Response.json({ error: e instanceof z.ZodError ? 'Datos inválidos' : e instanceof Error ? e.message : 'Datos inválidos' }, { status: 400, headers });
  }
}
