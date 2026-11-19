'use client';
import { useState } from 'react';
import { useLocale } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { crTodayISO } from '@/lib/time-cr';
/** Recovered from booking-modal at 5590123a^: Monday-first, circular days, cyan selection and availability dots. */
export function ReservationCalendar({ selected, onSelect, marked = [], availableOnly = false, compact = false, monthValue, onMonth }: {
    monthValue?:string;onMonth?:(month:string)=>void;
    selected: string;
    onSelect: (day: string) => void;
    marked?: string[];
    availableOnly?: boolean;
    compact?: boolean;
}) {
    const en = useLocale() === 'en', today = crTodayISO();
    const [localMonth, setMonth] = useState((selected || today).slice(0, 7));
    const month=monthValue??localMonth;
    const first = new Date(`${month}-01T12:00:00Z`), offset = (first.getUTCDay() + 6) % 7;
    const total = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    function move(n: number) { const d = new Date(first); d.setUTCMonth(d.getUTCMonth() + n); const value=d.toISOString().slice(0,7);setMonth(value);onMonth?.(value); }
    const weekdays = en ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    return <div className="min-w-0" data-reservation-calendar>
  <div className="mb-3 flex items-center justify-between">
   <button type="button" aria-label={en ? 'Previous month' : 'Mes anterior'} onClick={() => move(-1)} className="rounded-lg p-2 text-[#68778d] hover:bg-[#f3f4f6]"><ChevronLeft className="h-4 w-4"/></button>
   <span className="text-sm font-semibold first-letter:uppercase text-[#162543]">{first.toLocaleDateString(en ? 'en-US' : 'es-CR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
   <button type="button" aria-label={en ? 'Next month' : 'Mes siguiente'} onClick={() => move(1)} className="rounded-lg p-2 text-[#68778d] hover:bg-[#f3f4f6]"><ChevronRight className="h-4 w-4"/></button>
  </div>
  <div className="mb-1 grid grid-cols-7">{weekdays.map((d, i) => <div key={i} className="py-1 text-center text-xs font-medium text-[#68778d]">{d}</div>)}</div>
  <div className="grid grid-cols-7 gap-0.5">{Array.from({ length: offset }, (_, i) => <div key={'blank' + i}/>)}{Array.from({ length: total }, (_, i) => {
            const day = `${month}-${String(i + 1).padStart(2, '0')}`, active = selected === day, has = marked.includes(day), disabled = availableOnly && !has;
            return <button key={day} type="button" aria-label={day} aria-pressed={active} disabled={disabled} onClick={() => onSelect(day)} className={`relative flex ${compact ? "mx-auto h-9 w-9 max-w-full" : "aspect-square"} items-center justify-center rounded-full text-sm font-medium transition-colors ${active ? 'bg-[#009FD9] text-white shadow-sm' : disabled ? 'text-[#d1d5db]' : 'text-[#162543] hover:bg-[#EBF5FB]'}`}>
    {day === today && !active && <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[8px] font-bold text-[#009FD9]">{en ? 'TODAY' : 'HOY'}</span>}{i + 1}{has && !active && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#009FD9]"/>}
   </button>;
        })}</div>
 </div>;
}
