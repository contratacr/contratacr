'use client';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {appointmentCopy,appointmentField} from './appointment-copy';
export function AppointmentDuration({value,onChange,disabled=false}:{value:number;onChange:(value:number)=>void;disabled?:boolean}){
 const copy=appointmentCopy[useLocale()==='en'?'en':'es'];
 return <fieldset disabled={disabled} className="min-w-0 space-y-2"><legend className="text-sm font-semibold">{copy.duration}</legend><div className="flex flex-wrap gap-2">{[30,60,90,120].map(minutes=><Button key={minutes} type="button" variant={value===minutes?'default':'secondary'} aria-pressed={value===minutes} onClick={()=>onChange(minutes)}>{minutes} min</Button>)}</div><input aria-label={copy.duration} type="number" min={15} max={480} step={15} required value={Number.isFinite(value)?value:''} onChange={event=>onChange(event.target.value===''?NaN:Number(event.target.value))} className={appointmentField}/><p className="text-xs text-[#68778d]">{copy.durationHelp}</p></fieldset>;
}
