'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {contactFormAnswersSchema} from '@/lib/pro/contact-form';

/** Lead detail: the answers a customer typed in the contact form that created this lead (read only; empty for other leads). */
export function ContactFormAnswers({actor,leadId}:{actor:string;leadId:string}){
 const en=useLocale()==='en',[data,setData]=useState<{answers:{label:string;value:string}[];receivedAt?:string}|null>(null);
 useEffect(()=>{let alive=true;const timer=setTimeout(()=>{void fetch('/api/pro/contact-form?'+new URLSearchParams({leadId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}}).then(async r=>{if(!r.ok)return;const body=contactFormAnswersSchema.parse(await r.json());if(alive)setData(body.answers?{answers:body.answers,receivedAt:body.receivedAt}:null);}).catch(()=>undefined);},0);return()=>{alive=false;clearTimeout(timer);};},[actor,leadId]);
 if(!data)return null;
 const when=data.receivedAt?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(data.receivedAt)):'';
 return <section data-contact-form-answers className="min-w-0 space-y-2 rounded-xl border border-[#cfe9f3] bg-[#eaf7fb] p-3"><h3 className="font-semibold">{en?'Contact form details':'Detalles del formulario de contacto'}</h3>{when&&<p className="text-xs text-[#52627a]">{en?'Received ':'Recibido '}{when}</p>}
  <dl className="space-y-1 text-sm">{data.answers.map((a,i)=><div key={i}><dt className="font-semibold">{a.label}</dt><dd className="whitespace-pre-wrap break-words">{a.value||'—'}</dd></div>)}</dl></section>;
}
