import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {proBoundedJson,proQuery,proSameOrigin} from '@/lib/pro/route-common';
import {contactFormPublicSchema,contactFormReadableAnswers,contactFormSubmissionSchema,validateContactFormAnswers} from '@/lib/pro/contact-form';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// PUBLIC side of the contact form (no account). The form id in the link is a random id, separate from the owner id.
// GET ?id= returns the configuration of a published form. POST validates the answers against that configuration and creates the
// customer and the lead through SQL (pro_contact_form_submit), once per submission id.
// Spam control: honeypot field, consent, body cap, same-origin, per-IP limit and a daily cap per form.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const fail=(status:number,error:string,reason='unavailable')=>Response.json({error,reason},{status,headers});
const noStore=(limited:Response|null)=>{if(limited)for(const [k,v] of Object.entries(headers))limited.headers.set(k,v);return limited;};
const idSchema=z.string().uuid();
const stamp=()=>new Intl.DateTimeFormat('es-CR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'America/Costa_Rica'}).format(new Date());
const plain=(v:string)=>v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const limited=noStore(await enforceRateLimit(req,'contact-form-public-view',60,60000));if(limited)return limited;
 const raw=proQuery(req),id=idSchema.safeParse(raw?.id);if(!raw||!id.success||Object.keys(raw).length!==1)return fail(400,'Enlace inválido.','invalid');
 try{
  const r=await createAdminClient().rpc('pro_contact_form_public',{p_public:id.data});
  if(r.error)return fail(503,'No se pudo cargar el formulario.');
  if(!r.data)return fail(404,'Este formulario no está disponible.','gone');
  return Response.json(contactFormPublicSchema.parse(r.data),{headers});
 }catch{return fail(503,'No se pudo cargar el formulario.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return fail(403,'Origen no autorizado.','origin');
 const limited=noStore(await enforceRateLimit(req,'contact-form-public-send',8,600000));if(limited)return limited;
 let body;try{body=contactFormSubmissionSchema.parse(await proBoundedJson(req,16384));}catch{return fail(400,'Revise los datos enviados.','invalid');}
 // Honeypot: a person never fills the hidden field. Answer as if it worked so a bot learns nothing.
 if(body.website.trim())return Response.json({ok:true},{headers});
 const daily=noStore(await enforceRateLimitKey('contact-form-public-day:'+body.id+':'+new Date().toISOString().slice(0,10),200,86400000));if(daily)return daily;
 try{
  const db=createAdminClient(),form=await db.rpc('pro_contact_form_public',{p_public:body.id});
  if(form.error)return fail(503,'No se pudo enviar. Reintente.');if(!form.data)return fail(404,'Este formulario no está disponible.','gone');
  const config=contactFormPublicSchema.parse(form.data).config,checked=validateContactFormAnswers(config,body.answers);
  if(!checked.ok)return Response.json({error:'Revise los campos marcados.',reason:'fields',fields:checked.errors},{status:400,headers});
  const v=checked.values,single=(id:string)=>typeof v[id]==='string'?v[id] as string:'';
  const language=/^en/i.test(req.headers.get('accept-language')||'')?'en':'es',readable=contactFormReadableAnswers(config,v,language);
  const description=plain(readable.map(r=>r.label+': '+r.value).join('\n')).slice(0,2000);
  const row={name:single('name'),email:single('email').toLowerCase(),phone:single('phone'),service:('Formulario de contacto: '+single('name')+' · '+stamp()).slice(0,160),projectType:'',channel:'',address:single('address'),description};
  const saved=await db.rpc('pro_contact_form_submit',{p_public:body.id,p_submission:body.submissionId,p_row:row,p_answers:readable});
  if(saved.error)return fail(saved.error.code==='P0002'?404:503,saved.error.code==='P0002'?'Este formulario no está disponible.':'No se pudo enviar. Reintente: no se duplicará.',saved.error.code==='P0002'?'gone':'unavailable');
  return Response.json({ok:true,confirmation:config.confirmation},{headers});
 }catch{return fail(503,'No se pudo enviar. Reintente: no se duplicará.');}
}
