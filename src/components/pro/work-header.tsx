'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {useProSearchParams} from './use-pro-search-params';

export type WorkPhase='cancelled'|'completed'|'in_progress'|'scheduled'|'contracted'|'estimate_accepted'|'contract_sent'|'quoting'|'new';
type Facts={workId:string;phase:WorkPhase;planStart:string|null;planEnd:string|null;contractStatus:'draft'|'shared'|'accepted'|'declined'|null;estimateAccepted:boolean};
const labels:Record<WorkPhase,[string,string]>={cancelled:['Cancelada','Cancelled'],completed:['Finalizada','Completed'],in_progress:['En curso','In progress'],scheduled:['Agendada','Scheduled'],contracted:['Contrato aceptado','Contract accepted'],estimate_accepted:['Cotización aceptada','Quote accepted'],contract_sent:['Contrato enviado','Contract sent'],quoting:['En cotización','Quoting'],new:['Nuevo','New']};
/**
 * Round 1 (2026-11-12): the job header reflects the plan, the accepted estimate and the contract
 * (pro_work_header), not only the stored stage. `fallback` is shown until the facts load.
 */
export function WorkHeader({workId,fallbackStage,period,compact=false}:{workId:string;fallbackStage:string;period:{start:string;end:string;format:(value:string)=>string};compact?:boolean}){
 const en=useLocale()==='en',params=useProSearchParams(),view=params.get('vistaTrabajo')??'',[facts,setFacts]=useState<Facts|null>(null);
 useEffect(()=>{let alive=true;const load=()=>fetch('/api/pro/work-header?'+new URLSearchParams({workId}),{cache:'no-store'}).then(r=>r.ok?r.json():null).then((body:Facts|null)=>{if(alive&&body?.workId===workId)setFacts(body);}).catch(()=>{});void load();window.addEventListener('focus',load);return()=>{alive=false;window.removeEventListener('focus',load);};},[workId,view]);
 const day=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
 const chips=[facts?.estimateAccepted&&facts.phase!=='estimate_accepted'?(en?'Quote accepted':'Cotización aceptada'):null,facts?.contractStatus==='accepted'&&facts.phase!=='contracted'?(en?'Contract accepted':'Contrato aceptado'):facts?.contractStatus==='shared'&&facts.phase!=='contract_sent'?(en?'Contract sent':'Contrato enviado'):null].filter(Boolean);
 const hasDates=!!(period.start||period.end);
 const periodText=hasDates?<>{period.format(period.start)} — {period.format(period.end)}</>:facts?.planStart&&facts.planEnd?`Plan: ${day(facts.planStart)} – ${day(facts.planEnd)}`:(en?'Not scheduled':'Sin programar');
 // Round 9: one line on the job page — phase chip · milestones · dates.
 if(compact)return <>
  <span data-work-stage className="rounded-full bg-[#eaf7fb] px-2.5 py-0.5 text-xs font-bold text-[#008bb5]">{facts?labels[facts.phase][en?1:0]:fallbackStage}</span>
  {chips.length>0&&<span data-work-milestones>{chips.join(' · ')}</span>}
  <span data-work-period className="text-[#52627a]">{periodText}</span>
 </>;
 return <>
  <p data-work-stage>{facts?labels[facts.phase][en?1:0]:fallbackStage}</p>
  {chips.length>0&&<p data-work-milestones className="text-sm text-[#52627a]">{chips.join(' · ')}</p>}
  <p data-work-period>{hasDates?<>{period.format(period.start)} — {period.format(period.end)}</>:facts?.planStart&&facts.planEnd?(en?`Plan: ${day(facts.planStart)} – ${day(facts.planEnd)}`:`Plan: ${day(facts.planStart)} – ${day(facts.planEnd)}`):(en?'Not scheduled':'Sin programar')}</p>
 </>;
}
/**
 * Round 7A: the same derived phase in a list (customer record), e.g. «Cotización aceptada» instead
 * of the stored stage «Nuevo» once the accepted quote drives the job. `fallback` until it loads.
 */
export function WorkPhaseText({workId,fallback,prefix=''}:{workId:string;fallback:string;prefix?:string}){
 const en=useLocale()==='en',[phase,setPhase]=useState<WorkPhase|null>(null);
 useEffect(()=>{let alive=true;fetch('/api/pro/work-header?'+new URLSearchParams({workId}),{cache:'no-store'}).then(r=>r.ok?r.json():null).then((body:Facts|null)=>{if(alive&&body?.workId===workId&&body.phase in labels)setPhase(body.phase);}).catch(()=>{});return()=>{alive=false;};},[workId]);
 if(!phase&&!fallback)return null;
 return <>{prefix}<span data-work-phase={phase??undefined}>{phase?labels[phase][en?1:0]:fallback}</span></>;
}
