'use client';
import { useState, useRef } from 'react';
import { useLocale,useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {AppointmentWeeklySchedule} from './appointment-weekly-schedule';
import {AppointmentPreferences} from './appointment-preferences';
import { ReservationCalendar } from './reservation-calendar';
import { type Business, costaRicaDate } from '@/lib/pro/business';
import { crTodayISO } from '@/lib/time-cr';
const slotField = 'mt-1 block min-h-11 w-full min-w-0 max-w-full box-border appearance-none rounded-xl border border-[#e5e7eb] bg-white p-3 text-[#162543] focus:outline-none focus:ring-2 focus:ring-[#009FD9]';
export function AgendaCalendar({ data, commit, saving, loading = false, day, onDay,remote }: {
    remote?:import("./agenda-workspace").AgendaControls;
    data: Business;
    commit: (data: Business) => Promise<boolean>;
    saving: boolean;
    /** A background reload: it disables writes but must never trap the user in the sheet (only a save does). */
    loading?: boolean;
    day: string;
    onDay: (date: string) => void;
}) {
    const copy=useTranslations('ProControlsUX');
    const en = useLocale() === 'en', tr = (es: string, english: string) => en ? english : es;
    const [edit, setEdit] = useState(false), [error, setError] = useState('');
    const lock = useRef(false);
    const selected = day || crTodayISO();
    const dayStart=Date.parse(`${selected}T00:00:00-06:00`);
    const slots=data.availability.filter(s=>Date.parse(s.start)<dayStart+86400000&&Date.parse(s.end)>dayStart).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    const marked = [...data.work.filter(w => !w.cancelled).map(w => w.start.slice(0, 10)), ...data.availability.map(s => s.start.slice(0, 10))];
    async function save(next: Business) { if (lock.current)
        return false; lock.current = true; setError(''); try {
        const ok = await commit(next);
        if (!ok)
            setError(tr('No se pudo guardar. Recargue los datos antes de reintentar.', 'Could not save. Reload the data before retrying.'));
        return ok;
    }
    catch {
        setError(tr('No se pudo guardar. Intente nuevamente.', 'Could not save. Try again.'));
        return false;
    }
    finally {
        lock.current = false;
    } }
    return <>
 <div className="mx-auto w-full max-w-xl rounded-2xl border border-[#e5e7eb] bg-white p-4 md:p-5">
  <div data-public-availability className="mb-4">
  <div className="mt-3"><AppointmentPreferences/>
  <div className="flex flex-wrap gap-2"><AppointmentWeeklySchedule/><Button variant="secondary" onClick={()=>{setError('');setEdit(true);}}>{tr('Editar disponibilidad del día','Edit day availability')}</Button></div></div></div>
  <ReservationCalendar compact key={selected.slice(0,7)} selected={selected} onSelect={onDay} marked={remote?.marks??marked} monthValue={remote?.month} onMonth={remote?.setMonth}/>

 </div>
 <Modal ariaLabel={tr('Disponibilidad del día', 'Day availability')} closeLabel={tr('Cerrar', 'Close')} mobilePresentation="sheet-compact" open={edit} onClose={() => !saving && setEdit(false)} title={tr('Disponibilidad del día', 'Day availability')}>
  <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget), start = costaRicaDate(`${selected}T${f.get('time')}`), end = new Date(Date.parse(start) + Number(f.get('duration')) * 60000 - 6 * 3600000).toISOString().slice(0, 19) + '-06:00'; if (Date.parse(start) < new Date().getTime() + 15 * 60000) {
        setError(tr('Elija un horario futuro.', 'Choose a future time.'));
        return;
    } if (data.availability.some(s => Date.parse(s.start) < Date.parse(end) && Date.parse(s.end) > Date.parse(start))) {
        setError(tr('Este horario se superpone con otro.', 'This time overlaps another.'));
        return;
    } await save({ ...data, availability: [...data.availability, { start, end }] }); }}>
   <p className="text-sm text-[#68778d]">{tr("Agregue horarios para recibir solicitudes cuando active la opción.","Add times to receive requests when you enable the option.")}</p>
   <label className="block text-sm font-semibold">{tr('Fecha', 'Date')}<input type="date" aria-label={tr('Fecha disponible', 'Available date')} value={selected} min={crTodayISO()} onChange={e => onDay(e.target.value)} required className={slotField}/></label>
   <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">{tr('Hora', 'Time')}<input aria-label={tr('Hora disponible', 'Available time')} name="time" type="time" required defaultValue="09:00" className={slotField}/></label><label className="text-sm font-semibold">{tr('Duración', 'Duration')}<select name="duration" className={slotField}>{[30, 45, 60, 90, 120].map(n => <option key={n} value={n}>{n} min</option>)}</select></label></div>
   <Button type="submit" disabled={saving || loading}>{tr('Agregar horario', 'Add time')}</Button>
   <ul className="divide-y">{slots.map(s => <li key={s.start} className="flex items-center justify-between py-3 text-sm"><span>{s.start.slice(0,10)!==selected&&`${s.start.slice(0,10)} · `}{s.start.slice(11,16)}–{s.end.slice(11,16)}{s.start.slice(0,10)!==s.end.slice(0,10)&&` (${copy('nextDay')})`}</span><button type="button" aria-label={`${copy('removeTime')} ${s.start.slice(11,16)}–${s.end.slice(11,16)}`} disabled={saving || loading} className="min-h-11 rounded-lg px-3 font-semibold text-[#0089bb]" onClick={() => save({ ...data, availability: data.availability.filter(a => a.start !== s.start) })}>{tr('Quitar horario', 'Remove time')}</button></li>)}</ul>
   {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>
 </Modal>
 </>;
}
