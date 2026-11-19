'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {CheckCircle2,Circle} from 'lucide-react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {navigatePro} from '@/lib/pro/navigation';
import {openTeamSpace} from '@/lib/pro/team-navigation';

type Step={key:'profile'|'branding'|'customer'|'quote'|'job'|'client_linked'|'client_view'|'billing'|'team';done:boolean};
type Guide={steps:Step[];done:number;total:number};
/**
 * Round 12 (row 74): «Primeros pasos» on Pro's Inicio. Each step is derived from the account's own records
 * (nothing is stored); it explains what to do and opens the right place. It hides itself once every step is done.
 */
export function ProGettingStarted(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [guide,setGuide]=useState<Guide|null>(null),[failed,setFailed]=useState(false),[open,setOpen]=useState<string|null>(null),alive=useRef(true);
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/getting-started',{cache:'no-store'});if(!r.ok)throw Error();const body=await r.json() as Guide;if(alive.current)setGuide(body);}catch{if(alive.current)setFailed(true);}},[]);
 useEffect(()=>{alive.current=true;const timer=setTimeout(()=>void load(),0);return()=>{alive.current=false;clearTimeout(timer);};},[load]);
 if(failed)return <div role="alert" data-getting-started-error className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#d7e1ea] p-3 text-sm"><span>{t('No se pudo cargar la guía de primeros pasos.','Could not load the getting started guide.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!guide||guide.done>=guide.total)return null;
 const copy:Record<Step['key'],{title:string;help:string;action:string;go:()=>void}>={
  profile:{title:t('Complete el perfil de su empresa','Complete your company profile'),help:t('Nombre comercial, teléfono o WhatsApp y dirección. Se usan en cotizaciones, facturas y su perfil público.','Business name, phone or WhatsApp and address. They appear on quotes, invoices and your public profile.'),action:t('Abrir perfil','Open profile'),go:()=>navigatePro('pro_company',{empresa:'perfil'})},
  branding:{title:t('Personalice sus documentos','Brand your documents'),help:t('Elija colores y el nombre que verán sus clientes en cotizaciones, contratos y recibos.','Choose the colours and the name your customers see on quotes, contracts and receipts.'),action:t('Abrir documentos','Open documents'),go:()=>navigatePro('pro_company',{empresa:'documentos'})},
  customer:{title:t('Agregue su primer cliente','Add your first customer'),help:t('Puede crearlo a mano o importar una lista desde Excel (CSV) o contactos (vCard).','Create it by hand or import a list from Excel (CSV) or contacts (vCard).'),action:t('Abrir clientes','Open customers'),go:()=>navigatePro('pro_clients')},
  quote:{title:t('Prepare una cotización','Prepare a quote'),help:t('Use sus artículos guardados, impuestos y descuentos; compártala con el cliente para que la acepte en línea.','Use your saved items, taxes and discounts; share it so the customer can accept it online.'),action:t('Abrir cotizaciones','Open quotes'),go:()=>navigatePro('quotes')},
  job:{title:t('Cree un proyecto','Create a project'),help:t('Cada proyecto reúne tareas, cronograma, archivos, costos y pagos. Una cotización aceptada lo crea por usted.','Each project gathers tasks, schedule, files, costs and payments. An accepted quote creates it for you.'),action:t('Abrir proyectos','Open projects'),go:()=>navigatePro('pro_projects')},
  client_linked:{title:t('Invite al cliente a su proyecto','Invite the customer to the project'),help:t('Desde el proyecto, «Invitar al cliente» crea un enlace de un solo uso: el cliente verá el avance con su cuenta.','From the project, «Invite customer» creates a one-time link: the customer follows progress with their account.'),action:t('Abrir proyectos','Open projects'),go:()=>navigatePro('pro_projects')},
  client_view:{title:t('Decida qué ve el cliente','Choose what the customer sees'),help:t('En el proyecto, «Vista del cliente» activa finanzas, plan de pagos, cronograma, selecciones y más, con vista previa.','In the project, «Customer view» turns on finances, payment plan, schedule, selections and more, with a preview.'),action:t('Abrir proyectos','Open projects'),go:()=>navigatePro('pro_projects')},
  billing:{title:t('Cobre su trabajo','Bill your work'),help:t('Prepare un borrador de factura o un plan de pagos sin intereses. ContrataCR no financia ni cobra por usted.','Prepare an invoice draft or an interest-free payment plan. ContrataCR does not finance or collect for you.'),action:t('Abrir facturación','Open billing'),go:()=>navigatePro('pro_billing')},
  team:{title:t('Sume a su equipo','Add your team'),help:t('Invite a colaboradores con un rol (administrador, colaborador o solo lectura) para que trabajen en sus proyectos.','Invite collaborators with a role (administrator, contributor or read-only) to work on your projects.'),action:t('Abrir equipo','Open team'),go:()=>openTeamSpace(en)},
 };
 const percent=Math.round(guide.done/guide.total*100);
 return <section data-getting-started aria-labelledby="getting-started-title" className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 id="getting-started-title" className="text-base font-bold text-[#162543]">{t('Primeros pasos en Pro','Getting started with Pro')}</h2>
   <p data-getting-started-progress className="text-sm text-[#52627a]">{t(`${guide.done} de ${guide.total} pasos listos. Cada paso se marca solo cuando lo completa.`,`${guide.done} of ${guide.total} steps done. Each step checks itself when you complete it.`)}</p></div>
   <Button type="button" variant="ghost" onClick={()=>void load()}>{t('Actualizar','Refresh')}</Button></div>
  <div className="h-2 overflow-hidden rounded-full bg-[#e6edf3]" role="progressbar" aria-label={t('Avance de primeros pasos','Getting started progress')} aria-valuemin={0} aria-valuemax={guide.total} aria-valuenow={guide.done}><div className="h-full bg-[#008bb5]" style={{width:percent+'%'}}/></div>
  <ol className="divide-y divide-[#e6edf3]">{guide.steps.map(step=>{const c=copy[step.key],expanded=open===step.key;return <li key={step.key} data-getting-started-step={step.key} data-done={step.done?'true':'false'} className="py-2">
   <div className="flex items-start gap-3">{step.done?<CheckCircle2 aria-hidden className="mt-3 h-5 w-5 shrink-0 text-[#18794e]"/>:<Circle aria-hidden className="mt-3 h-5 w-5 shrink-0 text-[#94a3b8]"/>}
    <div className="min-w-0 flex-1"><button type="button" aria-expanded={expanded} onClick={()=>setOpen(expanded?null:step.key)} className={'min-h-11 text-left text-sm font-semibold '+(step.done?'text-[#52627a] line-through':'text-[#162543]')}>{c.title}<span className="sr-only">{step.done?t(' (listo)',' (done)'):t(' (pendiente)',' (to do)')}</span></button>
     {expanded&&<div data-getting-started-help className="space-y-2 pb-1"><p className="text-sm text-[#52627a]">{c.help}</p>{!step.done&&<Button type="button" variant="secondary" onClick={c.go}>{c.action}</Button>}</div>}</div></div>
  </li>;})}</ol>
 </section>;
}
