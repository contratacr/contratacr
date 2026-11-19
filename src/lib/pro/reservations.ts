import { businessSchema, type Business } from './business';
/** Public output contains times only; never customer names, notes or agenda contents. */
export function openReservationSlots(document: Business, now = Date.now()) {
    return document.availability.filter(s => Date.parse(s.start) > now + 15 * 60000 && Date.parse(s.start) < now + 90 * 86400000 && !document.work.some(w => !w.cancelled && Date.parse(w.start) < Date.parse(s.end) && Date.parse(w.end) > Date.parse(s.start))).sort((a, b) => a.start.localeCompare(b.start));
}
export function reserveSlot(document: Business, userId: string, name: string, start: string, service: string, id: string) {
    const existing = document.work.find(w => w.id === id);
    if (existing) {
        if (existing.bookingClientId !== userId || existing.start !== start)
            throw Error('Invalid request');
        return document;
    }
    const slot = openReservationSlots(document).find(s => s.start === start);
    if (!slot)
        throw Error('Slot unavailable');
    const clientId = `reservation-${userId}`;
    return businessSchema.parse({ ...document, clients: document.clients.some(c => c.id === clientId) ? document.clients.map(c => c.id === clientId ? { ...c, archived: false } : c) : [...document.clients, { id: clientId, name, email: '', phone: '', notes: '', archived: false }], work: [...document.work, { id, client: name, clientId, service, stage: 'scheduled', start: slot.start, end: slot.end, cancelled: false, bookingClientId: userId }] });
}
