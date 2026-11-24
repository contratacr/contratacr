'use client';
import {useState} from 'react';
import {useLocale} from 'next-intl';
import {ArrowUp,Sparkles} from 'lucide-react';
import {useRouter} from '@/i18n/navigation';

/**
 * Inline assistant card at the top of the service results (phones). Typing or tapping a chip opens the assistant
 * (/asistente) with the text prefilled; nothing is sent from here. The first name only shows when the account has one.
 */
export function ServiceAssistantCard({firstName,category,auto}:{firstName?:string|null;category?:string|null;auto?:boolean}){
 const locale=useLocale(),en=locale==='en',t=(es:string,e:string)=>en?e:es;
 const router=useRouter();
 const [text,setText]=useState('');
 const chips=auto
  ?[t('Necesito un cambio de aceite','I need an oil change'),t('Mi carro no enciende','My car will not start'),t('Necesito un diagnóstico','I need a diagnostic')]
  :[category?t(`Necesito ${category.toLowerCase()}`,`I need ${category.toLowerCase()}`):t('Necesito un profesional','I need a professional'),t('Quiero una cotización','I want a quote'),t('Es una urgencia','It is urgent')];
 const go=(v:string)=>{const q=v.trim();if(q)router.push(`/asistente?q=${encodeURIComponent(q)}`);};
 return <section data-service-assistant aria-label={t('Asistente','Assistant')} className="mx-0 my-3 rounded-3xl border border-[#cfe9f5] bg-gradient-to-br from-[#EBF5FB] to-white p-4 text-[#162543]">
  <p className="flex items-start gap-2 text-[16px] font-extrabold leading-snug"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#009FD9]" aria-hidden="true"/>{firstName?t(`Hola ${firstName}, ¿en qué le podemos ayudar hoy?`,`Hi ${firstName}, how can we help you today?`):t('Hola, ¿en qué le podemos ayudar hoy?','Hi, how can we help you today?')}</p>
  <div className="mt-3 flex flex-wrap gap-2">{chips.map(c=><button key={c} type="button" onClick={()=>go(c)} className="inline-flex min-h-9 items-center rounded-full border border-[#bfe3f3] bg-white px-3 text-[13px] font-bold text-[#00688f]">{c}</button>)}</div>
  <form onSubmit={e=>{e.preventDefault();go(text);}} className="mt-3 flex items-center gap-2 rounded-full border border-[#d7e1ea] bg-white pl-4 pr-1.5">
   <input value={text} onChange={e=>setText(e.target.value)} maxLength={300} aria-label={t('Cuéntenos qué necesita','Tell us what you need')} placeholder={t('Cuéntenos qué necesita','Tell us what you need')} className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#7a889c]"/>
   <button type="submit" aria-label={t('Enviar','Send')} disabled={!text.trim()} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#009FD9] text-white disabled:bg-[#b6c2d1]"><ArrowUp className="h-4 w-4" aria-hidden="true"/></button>
  </form>
  <p className="mt-2 text-[12.5px] font-medium text-[#5b6b82]">{t('El asistente le conectará con profesionales locales','The assistant will connect you with local professionals')}</p>
 </section>;
}
