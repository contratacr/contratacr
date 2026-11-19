'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {ContrataCRLogo} from '@/components/brand/brand-logo';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {PAYMENT_FAILURES,paymentLinkTokenSchema,paymentPublicViewSchema,type PaymentPublicView} from '@/lib/pro/integrations/payments/api';

/**
 * Round 6A: public payment page of a link (no account). The token arrives in the URL fragment, is moved
 * to sessionStorage (so a reload keeps working) and removed from the address bar. Card data goes only to
 * our server's processor adapter and is never stored; in MOCK mode the page says it is a test page and
 * lists the test cards. The result shown comes from the server after the processor event was booked.
 */
const api='/api/pro/pay',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543]';
const STORE='ccr-pay-link';
function tokenFromPage(){
 try{
  const hash=new URLSearchParams(window.location.hash.slice(1)).get('enlace');
  if(hash&&paymentLinkTokenSchema.safeParse(hash).success){try{window.sessionStorage.setItem(STORE,hash);}catch{/* private mode */}window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);return hash;}
  const saved=window.sessionStorage.getItem(STORE);return saved&&paymentLinkTokenSchema.safeParse(saved).success?saved:null;
 }catch{return null;}
}
export function PaymentLinkPortal(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [token,setToken]=useState<string|null|undefined>(undefined),[view,setView]=useState<PaymentPublicView|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[method,setMethod]=useState<'card'|'sinpe'>('card');
 const [card,setCard]=useState({number:'',exp:'',cvc:'',name:''}),[reference,setReference]=useState('');
 const attempt=useRef<{key:string;id:string}|null>(null);
 const call=useCallback(async(body:Record<string,unknown>)=>{
  const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const json=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error(json.error||'error'),{status:response.status});
  return paymentPublicViewSchema.parse(json);
 },[]);
 useEffect(()=>{const timer=setTimeout(()=>{const value=tokenFromPage();setToken(value);if(!value)return;
  call({action:'view',token:value}).then(next=>{setView(next);if(!next.methods.includes('card'))setMethod('sinpe');}).catch(cause=>setError((cause as {status?:number}).status===404?t('Este enlace de pago no existe o ya no está disponible.','This payment link does not exist or is no longer available.'):t('No se pudo abrir el enlace. Reintente.','Could not open the link. Retry.')));},0);
  return()=>clearTimeout(timer);},[call,t]);
 async function pay(kind:'card'|'sinpe'|'verify',extra:Record<string,unknown>){
  if(!token)return;const key=kind+JSON.stringify(extra);if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');
  try{const next=await call({action:kind,token,attemptId:kind==='verify'?extra.attemptId:attempt.current.id,...extra});attempt.current=null;setView(next);if(next.status==='active'&&next.lastFailure&&!next.openAttempt)setError(PAYMENT_FAILURES[next.lastFailure]?.[en?'en':'es']??t('El pago no se completó.','The payment was not completed.'));}
  catch(cause){setError((cause as Error).message||t('No se pudo procesar el pago. Reintente.','Could not process the payment. Retry.'));}
  finally{setBusy(false);}
 }
 function submitCard(event:FormEvent){event.preventDefault();const match=/^(\d{1,2})\s*\/\s*(\d{2,4})$/.exec(card.exp.trim());if(!match){setError(t('Escriba el vencimiento como MM/AA.','Enter the expiry as MM/YY.'));return;}
  const year=Number(match[2]!.length===2?'20'+match[2]:match[2]);void pay('card',{card:{number:card.number.replace(/[^\d ]/g,''),expMonth:Number(match[1]),expYear:year,cvc:card.cvc,name:card.name}});}
 const money=(cents:number)=>proMoney(cents/100,en);
 const shell=(children:React.ReactNode)=><main data-payment-portal={view?.status??'loading'} className="min-h-screen bg-[#f3f8fb] px-4 py-6 text-[#162543] sm:py-10"><div className="mx-auto w-full max-w-lg min-w-0 space-y-4"><div className="flex justify-center"><ContrataCRLogo/></div>{children}</div></main>;
 if(token===undefined||(!view&&!error))return shell(<p role="status" className="text-center text-sm">{t('Abriendo el enlace de pago…','Opening the payment link…')}</p>);
 if(!view)return shell(<div role="alert" className="rounded-2xl bg-white p-5 text-center">{error||t('Abra el enlace de pago que recibió.','Open the payment link you received.')}</div>);
 const mock=view.mode==='mock',open=view.openAttempt;
 return shell(<section className="min-w-0 space-y-4 rounded-2xl bg-white p-5 shadow-sm">
  {mock&&<p data-payment-portal-mock className="rounded-xl bg-[#fff6e0] p-3 text-sm text-[#7a4b00]">{t('Página de pago de PRUEBA: no se cobra dinero real.','TEST payment page: no real money is charged.')}</p>}
  <div className="min-w-0"><p className="text-sm text-[#52627a]">{t('Pago a ','Payment to ')}<strong>{view.businessName}</strong></p><h1 className="break-words text-xl font-bold">{view.description}</h1><p data-payment-portal-amount className="mt-2 text-3xl font-extrabold">{money(view.amountCents)}</p></div>
  {view.status==='paid'?<div data-payment-portal-paid role="status" className="rounded-xl bg-[#e7f5ec] p-4 text-[#1d5b33]"><p className="font-bold">{t('¡Pago recibido!','Payment received!')}</p><p className="text-sm">{t('Su pago quedó registrado con ','Your payment was recorded with ')}{view.businessName}.{view.paidAt?' '+new Date(view.paidAt).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'}):''}</p></div>
  :view.status!=='active'?<p data-payment-portal-closed role="status" className="rounded-xl bg-[#eef2f6] p-4">{view.status==='expired'?t('Este enlace venció. Pida uno nuevo al profesional.','This link expired. Ask the professional for a new one.'):t('Este enlace fue anulado por el profesional.','This link was cancelled by the professional.')}</p>
  :open?.status==='requires_action'?<div data-payment-portal-3ds className="space-y-3 rounded-xl border border-[#d7e1ea] p-4"><p className="font-bold">{t('Verificación de su banco','Bank verification')}{mock?t(' (simulada)',' (simulated)'):''}</p><p className="text-sm text-[#52627a]">{t('Su banco pide confirmar este pago.','Your bank asks to confirm this payment.')}</p>
   <div className="flex flex-wrap gap-2"><Button type="button" data-payment-portal-approve disabled={busy} onClick={()=>void pay('verify',{attemptId:open.id,approve:true})}>{t('Aprobar','Approve')}</Button><Button type="button" variant="secondary" data-payment-portal-reject disabled={busy} onClick={()=>void pay('verify',{attemptId:open.id,approve:false})}>{t('Rechazar','Reject')}</Button></div></div>
  :<>
   {view.methods.length>1&&<div role="tablist" aria-label={t('Medio de pago','Payment method')} className="grid grid-cols-2 gap-2">{view.methods.map(item=><button key={item} type="button" role="tab" aria-selected={method===item} data-payment-portal-method={item} onClick={()=>{setMethod(item);setError('');}} className={'min-h-11 rounded-xl border px-3 text-sm font-semibold '+(method===item?'border-[#008bb5] bg-[#eaf7fb] text-[#007aa0]':'border-[#d7e1ea] bg-white')}>{item==='card'?t('Tarjeta','Card'):'SINPE Móvil'}</button>)}</div>}
   {method==='card'?<form data-payment-portal-card onSubmit={submitCard} className="space-y-3">
    <label className="block text-sm font-bold">{t('Número de tarjeta','Card number')}<input inputMode="numeric" autoComplete="cc-number" required value={card.number} onChange={event=>setCard({...card,number:event.target.value})} className={field} placeholder="4242 4242 4242 4242"/></label>
    <div className="grid grid-cols-2 gap-3"><label className="block min-w-0 text-sm font-bold">{t('Vence (MM/AA)','Expiry (MM/YY)')}<input autoComplete="cc-exp" required value={card.exp} onChange={event=>setCard({...card,exp:event.target.value})} className={field} placeholder="12/30"/></label><label className="block min-w-0 text-sm font-bold">CVC<input inputMode="numeric" autoComplete="cc-csc" required maxLength={4} value={card.cvc} onChange={event=>setCard({...card,cvc:event.target.value.replace(/\D/g,'')})} className={field}/></label></div>
    <label className="block text-sm font-bold">{t('Nombre en la tarjeta','Name on card')}<input autoComplete="cc-name" required minLength={2} value={card.name} onChange={event=>setCard({...card,name:event.target.value})} className={field}/></label>
    <Button type="submit" data-payment-portal-pay disabled={busy} className="w-full">{busy?t('Procesando…','Processing…'):t('Pagar ','Pay ')+money(view.amountCents)}</Button>
    {mock&&<p className="text-xs text-[#52627a]">{t('Tarjetas de prueba: 4242 4242 4242 4242 aprobada · 4000 0000 0000 0002 rechazada · 4000 0000 0000 3220 pide verificación del banco.','Test cards: 4242 4242 4242 4242 approved · 4000 0000 0000 0002 declined · 4000 0000 0000 3220 asks for bank verification.')}</p>}
   </form>:<form data-payment-portal-sinpe onSubmit={event=>{event.preventDefault();void pay('sinpe',{reference:reference.trim()});}} className="space-y-3">
    <ol className="list-decimal space-y-1 pl-5 text-sm"><li>{t('Envíe ','Send ')}<strong>{money(view.amountCents)}</strong>{t(' por SINPE Móvil al ',' by SINPE Móvil to ')}<strong data-payment-portal-sinpe-phone>{view.sinpe?.phone?view.sinpe.phone.replace(/^(\d{4})(\d{4})$/,'$1-$2'):t('número que le indicó el profesional','number the professional gave you')}</strong>.</li><li>{t('En la descripción escriba ','In the description write ')}<strong data-payment-portal-sinpe-code>{view.sinpe?.code}</strong>.</li><li>{t('Escriba abajo el número de comprobante que le dio su banco.','Enter below the confirmation number your bank gave you.')}</li></ol>
    <label className="block text-sm font-bold">{t('Número de comprobante SINPE','SINPE confirmation number')}<input inputMode="numeric" required pattern="\d{8,25}" value={reference} onChange={event=>setReference(event.target.value.replace(/\D/g,''))} className={field}/></label>
    <Button type="submit" data-payment-portal-sinpe-confirm disabled={busy} className="w-full">{busy?t('Comprobando…','Checking…'):t('Ya envié el SINPE','I sent the SINPE')}</Button>
    {mock&&<p className="text-xs text-[#52627a]">{t('Prueba: cualquier número de 8 a 25 dígitos se confirma; si empieza con 000 no se encuentra.','Test: any 8–25 digit number is confirmed; one starting with 000 is not found.')}</p>}
   </form>}
  </>}
  {error&&<p role="alert" data-payment-portal-error className="text-sm text-red-700">{error}</p>}
  <p className="text-xs text-[#52627a]">{t('ContrataCR no guarda los datos de su tarjeta. Vence: ','ContrataCR does not store your card details. Expires: ')}{new Date(view.expiresAt).toLocaleDateString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium'})}</p>
 </section>);
}
