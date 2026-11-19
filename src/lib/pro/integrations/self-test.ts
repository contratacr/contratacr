import 'server-only';
import type {createAdminClient} from '@/lib/supabase/admin';
import {logOutbound} from './server';
import {verifyWebhook} from './webhook';
import {mockExchange,mockIssueCode} from './oauth/mock';
import {open,pkcePair,seal} from './oauth/vault';
import {originalPdf} from './esign/document';
import {MOCK_ESIGN_SECRET,mockEvent} from './esign/service';
import type {IntegrationMode} from './registry';
import {MockAiAdapter,MockTranscriber} from '@/lib/pro/ai/adapters';
import {aiTextOutputSchema} from '@/lib/pro/ai/features';
import {redactPersonal} from '@/lib/pro/ai/privacy';

/**
 * Round 6B: «Probar conexión» for the providers added in this round. Mock: local self-checks of the same code
 * paths the flow uses (PDF + signed provider event; PKCE + mock code exchange + token vault). Real modes do
 * not call anything from a connection test: they are verified by connecting the account (OAuth) or by the
 * first envelope in the provider sandbox.
 */
type Db=ReturnType<typeof createAdminClient>;
export async function testRound6bProvider(db:Db,owner:string,provider:'esign'|'google'|'microsoft'|'quickbooks',mode:IntegrationMode){
 if(mode!=='mock')return provider==='esign'?{ok:false,message:'La prueba real se hace enviando un sobre al entorno de pruebas del proveedor (no se ejecuta desde aquí).',en:'The real test is sending an envelope to the provider\'s test environment (it is not run from here).'}:{ok:false,message:'La prueba real es conectar la cuenta (OAuth) desde su pantalla.',en:'The real test is connecting the account (OAuth) from its screen.'};
 const started=Date.now();let ok=false;
 if(provider==='esign'){
  const pdf=originalPdf({kind:'contract',documentId:'00000000-0000-4000-8000-000000000000',label:'CT-PRUEBA',title:'Prueba',version:1,clientName:'Cliente de prueba',clientEmail:'cliente@example.test',language:'es',currency:'CRC',totalCents:100,content:{clauses:[{position:1,title:'Prueba',body:'Texto de prueba.'}]},contentHash:'0'.repeat(64)},'mock');
  const event=mockEvent('env_'+'0'.repeat(24),'sent');
  ok=pdf.subarray(0,8).toString('latin1')==='%PDF-1.4'&&verifyWebhook(MOCK_ESIGN_SECRET,event.body,event.signature).ok;
  await logOutbound(db,owner,{provider,mode,operation:'prueba',url:'https://esign.mock.local/selftest',statusCode:ok?200:500,outcome:ok?'ok':'error',durationMs:Date.now()-started,summary:{pdfBytes:pdf.length,signedEvent:ok}});
  return {ok,message:ok?'Simulación correcta: PDF generado y aviso firmado del proveedor verificado. No se envió nada.':'La simulación falló.',en:ok?'Simulation passed: PDF generated and the provider\'s signed notification verified. Nothing was sent.':'The simulation failed.'};
 }
 const {verifier,challenge}=pkcePair(),tokens=mockExchange(provider,mockIssueCode(provider,challenge),verifier),box=seal(tokens.accessToken,'mock');
 ok=open(box)===tokens.accessToken&&!box.includes(tokens.accessToken);
 await logOutbound(db,owner,{provider,mode,operation:'prueba',url:'https://oauth.mock.local/selftest',statusCode:ok?200:500,outcome:ok?'ok':'error',durationMs:Date.now()-started,summary:{pkce:'S256',encrypted:ok}});
 return {ok,message:ok?'Simulación correcta: PKCE, intercambio de código y cifrado del token verificados. No se contactó a ningún proveedor.':'La simulación falló.',en:ok?'Simulation passed: PKCE, code exchange and token encryption verified. No provider was contacted.':'The simulation failed.'};
}
/**
 * Round 6C: «Probar conexión» of the AI and transcription providers. Mock: deterministic fixture validated with
 * the same schema as a real answer + personal-data redaction of the log line. Real modes are NOT called from a
 * connection test (it would spend money): the first real suggestion after Isaac's OK is the test.
 */
export async function testRound6cProvider(db:Db,owner:string,provider:'ai'|'transcription',mode:IntegrationMode){
 if(mode!=='mock')return {ok:false,message:'Con claves reales la prueba es la primera sugerencia (no se gasta desde aquí). Revise el registro técnico después.',en:'With real keys the test is the first suggestion (nothing is spent from here). Check the technical log afterwards.'};
 const started=Date.now();let ok=false;
 if(provider==='ai'){
  const adapter=new MockAiAdapter(),result=await adapter.complete({feature:'quote_line',prompt:'prueba',language:'es',seed:'self-test',hints:{title:'Prueba'}});
  const masked=redactPersonal('Cliente Ana Pérez, ana@example.test, 8888-1234, cédula 1-1234-5678',['Ana Pérez']);
  ok=result.ok&&aiTextOutputSchema.safeParse(result.output).success&&!/ana@|8888|1234-5678|Ana Pérez/.test(masked);
 }else{
  const result=await new MockTranscriber().transcribe({bytes:new Uint8Array(4000),mime:'audio/webm',kind:'voice_note',language:'es'});
  ok=result.ok&&result.transcript.text.length>0;
 }
 await logOutbound(db,owner,{provider,mode,operation:'prueba',url:provider==='ai'?'https://ai.mock.local/selftest':'https://transcription.mock.local/selftest',statusCode:ok?200:500,outcome:ok?'ok':'error',durationMs:Date.now()-started,summary:{fixture:ok,redaction:provider==='ai'?ok:null}});
 return provider==='ai'
  ?{ok,message:ok?'Simulación correcta: sugerencia de prueba validada y datos personales ocultos en el registro. No se contactó a Anthropic.':'La simulación falló.',en:ok?'Simulation passed: test suggestion validated and personal data hidden in the log. Anthropic was not contacted.':'The simulation failed.'}
  :{ok,message:ok?'Simulación correcta: transcripción de prueba generada localmente. No se envió audio a ningún proveedor.':'La simulación falló.',en:ok?'Simulation passed: test transcript generated locally. No audio was sent to any provider.':'The simulation failed.'};
}
/**
 * Round 6D: «Probar conexión» of the marketing providers. Mock: local checks of the same code the feature uses
 * (Brevo request shape with one-click unsubscribe header built against a fake fetch; the clipper fixture parsed
 * + robots.txt refusal; ad cost conversion; custom-hostname request shape). Real modes are never called from here.
 */
export async function testRound6dProvider(db:Db,owner:string,provider:'marketing_email'|'meta_ads'|'google_ads'|'product_clipper'|'site_domain',mode:IntegrationMode){
 if(mode!=='mock')return {ok:false,message:'Con claves reales la prueba se hace después del OK de Isaac, con una cuenta de pruebas (no se ejecuta desde aquí).',en:'With real keys the test is done after Isaac\'s OK, with a test account (it is not run from here).'};
 const started=Date.now();let ok=false;let summary:Record<string,unknown>={};
 if(provider==='marketing_email'){
  const {BrevoCampaignSender}=await import('./marketing/brevo');let seen:{url:string;init:RequestInit}|null=null;
  const sender=new BrevoCampaignSender('mock-key-not-real',async(url,init)=>{seen={url,init};return new Response('{"messageId":"<mock@local>"}',{status:201});});
  const outcome=await sender.send({to:'prueba@example.test',subject:'Prueba',text:'Hola',unsubscribeUrl:'https://contratacr.com/baja-pro#t='+'0'.repeat(64),sender:{name:'Prueba',email:'prueba@example.test'},tags:['prueba']});
  const sent=seen as {url:string;init:RequestInit}|null;
  ok=outcome.ok&&!!sent&&sent.url.endsWith('/v3/smtp/email')&&String(sent.init.body).includes('List-Unsubscribe-Post')&&String(sent.init.body).includes('/api/pro/marketing-unsubscribe/one-click?t=');summary={requestShape:ok};
 }else if(provider==='product_clipper'){
  const {MockClipper}=await import('./clipper/adapters');const clipper=new MockClipper();
  const read=await clipper.read('https://tienda.example/producto/cemento'),blocked=await clipper.read('https://bloqueado.example/p/1');
  ok=read.ok&&read.metadata.price===7450&&!blocked.ok&&blocked.reason==='robots';summary={fixture:read.ok,robotsRespected:!blocked.ok};
 }else if(provider==='site_domain'){
  const {CloudflareCustomHostnames}=await import('./domain/cloudflare');const request=new CloudflareCustomHostnames('zone','token').createRequest('www.ejemplo.cr');
  ok=request.url.includes('/custom_hostnames')&&String(request.init.body).includes('"hostname":"www.ejemplo.cr"');summary={requestShape:ok};
 }else{
  const {microsToCents,NotActiveAdImporter}=await import('./ads/stubs');
  ok=microsToCents(12_345_670_000)===1_234_567&&await new NotActiveAdImporter(provider).dailySpend().then(()=>false,()=>true);summary={stub:true};
 }
 await logOutbound(db,owner,{provider,mode,operation:'prueba',url:`https://${provider.replace('_','-')}.mock.local/selftest`,statusCode:ok?200:500,outcome:ok?'ok':'error',durationMs:Date.now()-started,summary});
 const texts:Record<typeof provider,[string,string]>={
  marketing_email:['Simulación correcta: el correo se armó con enlace de baja de un clic y no se envió nada.','Simulation passed: the email was built with a one-click unsubscribe link and nothing was sent.'],
  product_clipper:['Simulación correcta: página de ejemplo leída (Open Graph / schema.org) y robots.txt respetado. No se visitó ningún sitio.','Simulation passed: sample page read (Open Graph / schema.org) and robots.txt respected. No website was visited.'],
  site_domain:['Simulación correcta: solicitud de dominio propio armada. No se contactó a Cloudflare.','Simulation passed: custom domain request built. Cloudflare was not contacted.'],
  meta_ads:['Simulación correcta: el importador de costos está documentado y apagado. Los costos se anotan a mano.','Simulation passed: the cost importer is documented and off. Costs are typed by hand.'],
  google_ads:['Simulación correcta: el importador de costos está documentado y apagado. Los costos se anotan a mano.','Simulation passed: the cost importer is documented and off. Costs are typed by hand.'],
 };
 return ok?{ok,message:texts[provider][0],en:texts[provider][1]}:{ok,message:'La simulación falló.',en:'The simulation failed.'};
}
