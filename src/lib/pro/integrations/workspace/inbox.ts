import 'server-only';
import type {createAdminClient} from '@/lib/supabase/admin';
import {logOutbound,timedFetch} from '../server';
import {accessToken,connectionMode,OAuthError} from '../oauth/service';
import type {WorkspaceProvider} from './adapters';

/**
 * Family 10: inbox sync of the owner's mailbox (read-only copy of sender, subject, snippet and date).
 * · Mock: three deterministic sample messages, no network.
 * · Real (Gmail API / Microsoft Graph): written from the public references, only constructed with a real access
 *   token (sandbox/production with env keys) and the read scope (gmail.readonly / Mail.Read) — not run here.
 * Nothing is sent and message bodies are never stored (only a short snippet).
 */
type Db=ReturnType<typeof createAdminClient>;
export type InboxItem={remoteId:string;fromEmail:string;fromName:string|null;subject:string;snippet:string;receivedAt:string};
const sample=(provider:WorkspaceProvider):InboxItem[]=>[
 {remoteId:`mock-inbox-${provider}-1`,fromEmail:'maria.rojas@example.test',fromName:'María Rojas',subject:'Consulta por remodelación de cocina',snippet:'Buenas, quisiera una cotización para remodelar la cocina y cambiar el piso.',receivedAt:'2026-11-20T15:10:00.000Z'},
 {remoteId:`mock-inbox-${provider}-2`,fromEmail:'proveedor@example.test',fromName:'Ferretería Central',subject:'Su pedido está listo',snippet:'El pedido de cemento y varilla puede retirarse desde mañana.',receivedAt:'2026-11-21T13:30:00.000Z'},
 {remoteId:`mock-inbox-${provider}-3`,fromEmail:'carlos.mora@example.test',fromName:null,subject:'Fotos del avance',snippet:'Le adjunto las fotos del baño terminado, quedó excelente.',receivedAt:'2026-11-22T09:05:00.000Z'},
];
const clean=(value:string|undefined,max:number)=>(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').trim().slice(0,max);
async function gmail(token:string){
 const list=await timedFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&labelIds=INBOX',{headers:{Authorization:'Bearer '+token}});
 if(list.status===401||list.status===403)throw new OAuthError(409,'scope','Vuelva a conectar la cuenta para permitir leer el correo.');
 if(list.status!==200)throw new OAuthError(503,'provider','El proveedor no respondió. Reintente.');
 const ids=((await list.response!.json()) as {messages?:{id:string}[]}).messages??[];
 const items:InboxItem[]=[];
 for(const {id} of ids.slice(0,25)){
  const call=await timedFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,{headers:{Authorization:'Bearer '+token}});
  if(call.status!==200)continue;
  const json=await call.response!.json() as {id:string;snippet?:string;internalDate?:string;payload?:{headers?:{name:string;value:string}[]}};
  const header=(name:string)=>json.payload?.headers?.find(h=>h.name.toLowerCase()===name)?.value;
  const from=clean(header('from'),300),match=from.match(/^(.*?)\s*<([^>]+)>$/),email=(match?.[2]??from).toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))continue;
  items.push({remoteId:json.id,fromEmail:email.slice(0,254),fromName:match?.[1]?clean(match[1].replace(/^"|"$/g,''),120)||null:null,subject:clean(header('subject'),300)||'(sin asunto)',snippet:clean(json.snippet,400),receivedAt:new Date(Number(json.internalDate??Date.now())).toISOString()});
 }
 return items;
}
async function graph(token:string){
 const call=await timedFetch('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$select=id,subject,from,receivedDateTime,bodyPreview&$orderby=receivedDateTime desc',{headers:{Authorization:'Bearer '+token}});
 if(call.status===401||call.status===403)throw new OAuthError(409,'scope','Vuelva a conectar la cuenta para permitir leer el correo.');
 if(call.status!==200)throw new OAuthError(503,'provider','El proveedor no respondió. Reintente.');
 const json=await call.response!.json() as {value?:{id:string;subject?:string;bodyPreview?:string;receivedDateTime:string;from?:{emailAddress?:{address?:string;name?:string}}}[]};
 const items:InboxItem[]=[];
 for(const row of json.value??[]){
  const email=(row.from?.emailAddress?.address??'').toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))continue;
  items.push({remoteId:row.id.slice(0,200),fromEmail:email.slice(0,254),fromName:clean(row.from?.emailAddress?.name,120)||null,subject:clean(row.subject,300)||'(sin asunto)',snippet:clean(row.bodyPreview,400),receivedAt:new Date(row.receivedDateTime).toISOString()});
 }
 return items;
}
export async function syncInbox(db:Db,owner:string,provider:WorkspaceProvider){
 const resolved=await connectionMode(db,owner,provider);
 if(resolved.status!=='ready')throw new OAuthError(409,resolved.status,'Integración no disponible en este modo.');
 const token=await accessToken(db,owner,provider);
 if(!token||token.mode!==resolved.mode)throw new OAuthError(409,'not_connected','Conecte la cuenta primero.');
 const started=Date.now();
 const items=resolved.mode==='mock'?sample(provider):provider==='google'?await gmail(token.token):await graph(token.token);
 const stored=await db.rpc('pro_inbox_store',{p_actor:owner,p_provider:provider,p_mode:resolved.mode,p_messages:items});
 if(stored.error)throw new OAuthError(stored.error.code==='42501'?403:stored.error.code==='22023'?400:503,'store','No se pudo guardar el correo recibido.');
 await logOutbound(db,owner,{provider,mode:resolved.mode,operation:resolved.mode==='mock'?'inbox_simulated':'inbox_sync',url:resolved.mode==='mock'?'https://mail.mock.local/inbox':provider==='google'?'https://gmail.googleapis.com/gmail/v1/users/me/messages':'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages',statusCode:200,outcome:'ok',durationMs:Date.now()-started,summary:{received:items.length}});
 return stored.data as {inserted:number;received:number};
}
