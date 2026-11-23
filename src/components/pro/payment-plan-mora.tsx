'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {paymentPlanMoraSchema,paymentPlanReminderResultSchema,type MoraKind,type PaymentPlanMora} from '@/lib/pro/payment-plan';

/**
 * Row 57: mora state of the installment plan and its reminders. The tray (app) is recorded here; e-mail and SMS go through the
 * reminder adapter, which is the sandbox: nothing is sent to the customer. The customer already sees due/overdue installments in their view and bell.
 */
const api='/api/pro/payment-plan-reminders';
const tone:Record<MoraKind,string>={upcoming:'bg-[#eaf5fb] text-[#006e90]',late_light:'bg-[#fff4dc] text-[#7a4b00]',late_moderate:'bg-[#fdf0eb] text-[#a03c1f]',late_severe:'bg-[#f9dfd8] text-[#7d2410]'};
export function PaymentPlanMora({accountId,workId,disabled,refreshKey}:{accountId:string;workId:string;disabled:boolean;refreshKey:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,money=(cents:number)=>proMoney(cents/100,en);
 const [data,setData]=useState<PaymentPlanMora|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const kinds:Record<MoraKind,string>={upcoming:t('Por vencer','Due soon'),late_light:t('Mora leve (1 a 7 días)','Light mora (1 to 7 days)'),late_moderate:t('Mora moderada (8 a 30 días)','Moderate mora (8 to 30 days)'),late_severe:t('Mora grave (más de 30 días)','Severe mora (over 30 days)')};
 const channels={app:t('Bandeja','In-app tray'),email:t('Correo','E-mail'),sms:'SMS'};
 const statuses={recorded:t('Registrado','Recorded'),queued:t('En cola','Queued'),sandbox_sent:t('Simulado (no se envió)','Simulated (not sent)'),failed:t('No se pudo','Failed')};
 const day=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(iso.slice(0,10)+'T00:00:00Z'));
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();setData(paymentPlanMoraSchema.parse(await r.json()));}catch{setFailed(true);}},[accountId,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load,refreshKey]);
 async function prepare(){setBusy(true);setError('');setNotice('');
  try{const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({action:'prepare',workId})});if(!r.ok)throw Error();
   const out=paymentPlanReminderResultSchema.parse(await r.json());
   setNotice(out.created===0?t('No hay recordatorios nuevos: ya se registraron los de hoy.','No new reminders: today\'s are already recorded.'):t(`Se registraron ${out.created} recordatorios (${out.app} en la bandeja, ${out.email} por correo y ${out.sms} por SMS). El correo y el SMS quedan en modo de prueba: no se envió nada.`,`${out.created} reminders recorded (${out.app} in the tray, ${out.email} by e-mail and ${out.sms} by SMS). E-mail and SMS are in test mode: nothing was sent.`));
   await load();}
  catch{setError(t('No se pudieron preparar los recordatorios. Reintente.','Could not prepare the reminders. Retry.'));}finally{setBusy(false);}}
 if(!data)return failed?<p role="alert" data-plan-mora-error className="text-sm text-red-700">{t('No se pudo cargar la mora.','Could not load the mora state.')} <button type="button" className="font-semibold underline" onClick={()=>void load()}>{t('Reintentar','Retry')}</button></p>:null;
 const s=data.summary;
 return <div data-plan-mora={s.worstLevel??'current'} className="min-w-0 space-y-3 rounded-xl border border-[#e5ebf1] bg-[#f9fbfd] p-3">
  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1 basis-56"><p className="font-semibold text-[#162543]">{t('Mora y recordatorios','Mora and reminders')}</p>
   <p data-plan-mora-summary className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ${s.worstLevel?tone[s.worstLevel]:'bg-[#eef8f4] text-[#18573a]'}`}>{s.worstLevel?t(`${kinds[s.worstLevel]}: ${s.lateCount} cuota${s.lateCount===1?'':'s'} por ${money(s.lateCents)}`,`${kinds[s.worstLevel]}: ${s.lateCount} installment${s.lateCount===1?'':'s'} for ${money(s.lateCents)}`):t('Al día','Up to date')}</p></div>
   <Button type="button" data-plan-reminders-prepare disabled={disabled||busy||(s.lateCount===0&&s.upcomingCount===0)} onClick={()=>void prepare()}>{t('Preparar recordatorios','Prepare reminders')}</Button></div>
  {s.lateFeeCents>0&&<p className="text-xs text-[#52627a]">{t(`Recargo por atraso del plan (monto fijo por cuota vencida): ${money(s.lateFeeCents)}.`,`Plan late fee (flat amount per overdue installment): ${money(s.lateFeeCents)}.`)}</p>}
  {notice&&<p role="status" data-plan-reminders-notice className="rounded-lg bg-[#eef8f4] p-2 text-sm text-[#18573a]">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {data.rows.length>0&&<ul data-plan-mora-rows className="space-y-1 text-sm">{data.rows.map(r=><li key={r.planId+r.seq} data-plan-mora-row={r.kind} className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words text-[#162543]">{r.itemKind==='down'?t('Prima','Down payment'):t('Cuota ','Installment ')+r.seq} · {day(r.dueDate)}{r.daysOverdue>0?' · '+t(`${r.daysOverdue} días de atraso`,`${r.daysOverdue} days overdue`):''}</span>
   <span className="flex items-center gap-2"><span className="tabular-nums">{money(r.pendingCents)}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[r.kind]}`}>{kinds[r.kind]}</span></span></li>)}</ul>}
  {data.reminders.length>0&&<details className="rounded-lg border border-[#e5ebf1] p-2"><summary className="cursor-pointer text-sm font-semibold text-[#162543]">{t('Historial de recordatorios','Reminder history')}</summary>
   <ul data-plan-reminders className="mt-2 space-y-1 text-xs text-[#52627a]">{data.reminders.map(r=><li key={r.id} data-plan-reminder={r.channel+':'+r.status} className="flex flex-wrap justify-between gap-2"><span>{new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(r.createdAt))} · {channels[r.channel]} · {kinds[r.kind]}</span><span>{statuses[r.status]}</span></li>)}</ul></details>}
 </div>;
}
