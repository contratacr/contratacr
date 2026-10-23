'use client';
import { useState, useRef } from 'react';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ReservationCalendar } from './reservation-calendar';
import { type Business, costaRicaDate } from '@/lib/pro/business';
import { crTodayISO } from '@/lib/time-cr';
const slotField = 'mt-1 block min-h-11 w-full min-w-0 max-w-full box-border appearance-none rounded-xl border border-[#e5e7eb] bg-white p-3 text-[#162543] focus:outline-none focus:ring-2 focus:ring-[#009FD9]';
export function AgendaCalendar({ data, commit, saving, day, onDay }: {
    data: Business;
    commit: (data: Business) => Promise<boolean>;
    saving: boolean;
    day: string;
    onDay: (date: string) => void;
}) {
    const en = useLocale() === 'en', tr = (es: string, english: string) => en ? english : es;
    const [edit, setEdit] = useState(false), [error, setError] = useState('');
    const lock = useRef(false);
    const selected = day || crTodayISO();
    const slots = data.availability.filter(s => s.start.slice(0, 10) === selected).sort((a, b) => a.start.localeCompare(b.start));
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
 <div className="grid gap-5 rounded-2xl border border-[#e5e7eb] bg-white p-4 md:grid-cols-[minmax(240px,320px)_1fr] md:p-5">
  <ReservationCalendar key={selected.slice(0, 7)} selected={selected} onSelect={onDay} marked={marked}/>
  <div className="min-w-0 md:border-l md:border-[#e5e7eb] md:pl-5">
   <h3 className="font-bold text-[#162543]">{tr('Disponibilidad para reservas', 'Booking availability')}</h3>
   <p className="mt-1 text-sm text-[#68778d]">{tr('Sus clientes reservan gratis en su perfil. Horarios de Costa Rica.', 'Customers book free on your profile. Costa Rica time.')}</p>
   <div className="my-3 flex flex-wrap gap-2">{slots.length ? slots.map(s => {
            const occupied = data.work.some(w => !w.cancelled && Date.parse(w.start) < Date.parse(s.end) && Date.parse(w.end) > Date.parse(s.start));
            return <span key={s.start} className={`rounded-xl px-3 py-2 text-sm ${occupied ? 'bg-[#f3f4f6] text-[#68778d]' : 'bg-[#EBF5FB] text-[#0089bb]'}`}>{s.start.slice(11, 16)}{occupied ? ' · ' + tr('Reservado', 'Booked') : ''}</span>;
        }) : <p className="py-2 text-sm text-[#68778d]">{tr('No hay horarios publicados para este día.', 'No published times for this day.')}</p>}</div>
   <Button variant="secondary" onClick={() => { setError(''); setEdit(true); }}>{tr('Editar disponibilidad', 'Edit availability')}</Button>
  </div>
 </div>
 <Modal mobilePresentation="sheet-compact" open={edit} onClose={() => !saving && setEdit(false)} title={tr('Disponibilidad del día', 'Day availability')}>
  <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget), start = costaRicaDate(`${selected}T${f.get('time')}`), end = new Date(Date.parse(start) + Number(f.get('duration')) * 60000 - 6 * 3600000).toISOString().slice(0, 19) + '-06:00'; if (Date.parse(start) < new Date().getTime() + 15 * 60000) {
        setError(tr('Elija un horario futuro.', 'Choose a future time.'));
        return;
    } if (data.availability.some(s => Date.parse(s.start) < Date.parse(end) && Date.parse(s.end) > Date.parse(start))) {
        setError(tr('Este horario se superpone con otro.', 'This time overlaps another.'));
        return;
    } await save({ ...data, availability: [...data.availability, { start, end }] }); }}>
   <label className="block text-sm font-semibold">{tr('Fecha', 'Date')}<input type="date" aria-label={tr('Fecha disponible', 'Available date')} value={selected} min={crTodayISO()} onChange={e => onDay(e.target.value)} required className={slotField}/></label>
   <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">{tr('Hora', 'Time')}<input aria-label={tr('Hora disponible', 'Available time')} name="time" type="time" required defaultValue="09:00" className={slotField}/></label><label className="text-sm font-semibold">{tr('Duración', 'Duration')}<select name="duration" className={slotField}>{[30, 45, 60, 90, 120].map(n => <option key={n} value={n}>{n} min</option>)}</select></label></div>
   <Button type="submit" disabled={saving}>{tr('Agregar horario', 'Add time')}</Button>
   <ul className="divide-y">{slots.map(s => <li key={s.start} className="flex items-center justify-between py-3 text-sm"><span>{s.start.slice(11, 16)}</span><button type="button" disabled={saving} className="font-semibold text-[#0089bb]" onClick={() => save({ ...data, availability: data.availability.filter(a => a.start !== s.start) })}>{tr('Quitar horario', 'Remove time')}</button></li>)}</ul>
   {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>
 </Modal>
 </>;
}
