'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ReservationCalendar } from './reservation-calendar';
type Slot = {
    start: string;
    end: string;
};
export function PublicReservations({ professional, service, isOwn = false }: {
    professional: string;
    service: string;
    isOwn?: boolean;
}) {
    const en = useLocale() === 'en', tr = (es: string, english: string) => en ? english : es;
    const ref = useRef<HTMLDivElement>(null), busy = useRef(false), key = useRef('');
    const [offset, setOffset] = useState(0);
    const [slots, setSlots] = useState<Slot[]>([]), [enabled, setEnabled] = useState(false), [open, setOpen] = useState(false), [date, setDate] = useState(''), [time, setTime] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState(''), [login, setLogin] = useState(false), [success, setSuccess] = useState(false);
    async function load(signal?: AbortSignal) { try {
        const r = await fetch(`/api/pro/reservations?professional=${professional}`, { signal });
        if (!r.ok)
            throw Error();
        const data = await r.json();
        setEnabled(data.enabled);
        setSlots(data.slots);
        setDate(d => d || data.slots[0]?.start.slice(0, 10) || '');
    }
    catch { /* Contact actions remain available when calendar cannot load. */ } }
    useEffect(() => { const controller = new AbortController(); const node = ref.current; if (!node)
        return; const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) {
        observer.disconnect();
        void load(controller.signal);
    } }, { rootMargin: '100px' }); observer.observe(node); return () => { observer.disconnect(); controller.abort(); }; }, [professional]); // eslint-disable-line react-hooks/exhaustive-deps
    async function book() {
        if (busy.current || !time)
            return;
        busy.current = true;
        setSaving(true);
        setError('');
        setLogin(false);
        key.current ||= crypto.randomUUID();
        try {
            const r = await fetch('/api/pro/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ professional, start: time, service, requestId: key.current }) });
            if (r.status === 401) {
                setLogin(true);
                return;
            }
            if (!r.ok) {
                setError(tr('No se pudo confirmar. Revise la disponibilidad e intente nuevamente.', 'Could not confirm. Check availability and try again.'));
                if (r.status === 409) {
                    key.current = '';
                    setTime('');
                    await load();
                }
                return;
            }
            setSuccess(true);
            await load();
        }
        catch {
            setError(tr('No hay conexión. Puede reintentar sin duplicar la reserva.', 'Connection lost. Retrying will not duplicate the booking.'));
        }
        finally {
            busy.current = false;
            setSaving(false);
        }
    }
    const days = [...new Set(slots.map(s => s.start.slice(0, 10)))];
    const pageDays = days.slice(Math.min(offset, Math.max(0, days.length - 3)), Math.min(offset, Math.max(0, days.length - 3)) + 3);
    function pick(start: string) { if (isOwn)
        return; setDate(start.slice(0, 10)); setTime(start); key.current = ''; setSuccess(false); setError(''); setLogin(false); setOpen(true); }
    return <div ref={ref}>
 {enabled && slots.length > 0 && <div className="mt-3 flex w-full items-start gap-1" data-public-schedule>
 <button type="button" aria-label={tr('Días anteriores', 'Previous days')} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 3))} className="min-h-11 px-1 text-[#68778d] disabled:opacity-30"><ChevronLeft className="h-4 w-4"/></button>
 <div className="grid flex-1 grid-cols-3 gap-2">{pageDays.map(day => { const times = slots.filter(s => s.start.slice(0, 10) === day); return <div key={day} className="flex min-w-0 flex-col gap-1.5"><p className="truncate text-center text-[11px] font-semibold leading-tight text-[#6b7280]">{new Date(day + 'T12:00:00Z').toLocaleDateString(en ? 'en-US' : 'es-CR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</p>{times.slice(0, 3).map(s => <button type="button" key={s.start} disabled={isOwn} onClick={() => pick(s.start)} className="min-h-8 w-full rounded-md bg-[#EBF5FB] py-1 text-[11px] font-semibold leading-none text-[#0089bb] transition-colors hover:bg-[#009FD9] hover:text-white disabled:opacity-50">{s.start.slice(11, 16)}</button>)}{times.length > 3 && <button type="button" disabled={isOwn} onClick={() => pick(times[3].start)} className="min-h-8 rounded-md border border-dashed border-[#bfdbfe] py-1 text-[10px] font-bold text-[#0089bb]">+{times.length - 3}</button>}</div>; })}</div>
 <button type="button" aria-label={tr('Días siguientes', 'Next days')} disabled={offset + 3 >= days.length} onClick={() => setOffset(Math.min(Math.max(0, days.length - 3), offset + 3))} className="min-h-11 px-1 text-[#68778d] disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button>
 </div>}
 {enabled && <Button variant="secondary" className="mt-3 w-full" disabled={isOwn} onClick={() => { setOpen(true); setSuccess(false); setError(''); setLogin(false); setTime(''); key.current = ''; void load(); }}><CalendarDays className="mr-2 h-4 w-4"/>{tr('Ver disponibilidad', 'View availability')}</Button>}
 <Modal open={open} onClose={() => !saving && setOpen(false)} title={success ? tr('Cita confirmada', 'Booking confirmed') : tr('Reservar una cita', 'Book an appointment')}>
 {success ? <div className="space-y-4"><p className="text-[#162543]">{tr('Su cita quedó en la agenda del profesional.', 'Your appointment is in the professional’s agenda.')}</p><p className="font-semibold">{new Date(time).toLocaleString(en ? 'en-US' : 'es-CR', { timeZone: 'America/Costa_Rica', dateStyle: 'long', timeStyle: 'short' })}</p><Button onClick={() => setOpen(false)}>{tr('Listo', 'Done')}</Button></div> : <div className="space-y-4"><p className="text-sm text-[#68778d]">{tr('Reservar es gratis. Horarios de Costa Rica.', 'Booking is free. Costa Rica time.')}</p>{slots.length ? <div className="grid gap-5 md:grid-cols-2"><ReservationCalendar selected={date} availableOnly marked={slots.map(s => s.start.slice(0, 10))} onSelect={d => { setDate(d); setTime(''); key.current = ''; }}/><div className="md:border-l md:pl-5"><h3 className="mb-3 font-semibold">{tr('Horarios disponibles', 'Available times')}</h3><div className="flex flex-wrap gap-2">{slots.filter(s => s.start.slice(0, 10) === date).map(s => <button key={s.start} type="button" aria-pressed={time === s.start} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ${time === s.start ? 'border-[#009FD9] bg-[#009FD9] text-white' : 'border-[#e5e7eb] text-[#162543] hover:bg-[#EBF5FB]'}`} onClick={() => { setTime(s.start); key.current = ''; }}>{s.start.slice(11, 16)}</button>)}</div></div></div> : <p>{tr('No hay horarios disponibles por ahora. Puede contactar al profesional.', 'No times available right now. You can contact the professional.')}</p>}
 {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{login && <p role="alert">{tr('Inicie sesión con su cuenta gratuita para confirmar.', 'Sign in with your free account to confirm.')} <a className="font-semibold text-[#0089bb] underline" href={`/${en ? 'en/' : ''}login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/')}`}>{tr('Ingresar', 'Sign in')}</a></p>}
 <Button disabled={!time || saving} onClick={book}>{saving ? tr('Confirmando…', 'Confirming…') : tr('Confirmar cita', 'Confirm booking')}</Button></div>}
 </Modal>
 </div>;
}
