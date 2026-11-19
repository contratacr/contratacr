import {randomBytes} from 'node:crypto';
import {proApiAccess} from '@/lib/pro/api-access';
import {directProjectQuoteSchema,directProjectQuoteDto,directProjectPublicCode} from '@/lib/pro/direct-project-quotes';
import {writeSourceColumns} from '@/lib/security/write-guard';
const headers={'Cache-Control':'private, no-store'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development'||!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''))return fail(404,'unavailable');
 try{
  const access=await proApiAccess(req);if(access.error)return access.error;
  if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(400,'invalid_input');
  const reader=req.body?.getReader();if(!reader)return fail(400,'invalid_input');
  let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>64000){await reader.cancel();return fail(413,'body_too_large');}text+=decoder.decode(next.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  let body;try{body=directProjectQuoteSchema.parse(JSON.parse(text));}catch{return fail(400,'invalid_input');}
  if(body.sourceManualLeadId)return fail(400,'invalid_quote_context');
  const saved=await access.db.rpc('pro_direct_project_quote_create',{p_actor:access.user.id,p_input:body,p_source:{...writeSourceColumns(req),public_code:directProjectPublicCode(randomBytes(12))}});
  if(saved.error){const code=saved.error.code;return fail(code==='42501'?403:code==='P0002'?404:['40001','23505','23514'].includes(code)?409:['22023','22P02'].includes(code)?400:503,'quote_create_failed');}
  if(!saved.data?.quote?.id)return fail(503,'unavailable');
  return Response.json({quote:directProjectQuoteDto(saved.data.quote)},{headers});
 }catch{return fail(503,'unavailable');}
}
