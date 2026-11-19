/** Costa Rican calendar day without changing the source timestamp or its offset. */
export function agendaDay(value:string){const at=Date.parse(value);return Number.isFinite(at)?new Date(at-6*3600000).toISOString().slice(0,10):'';}
/** Native datetime-local expects CR wall time, independent of the simulator timezone. */
export function agendaWallTime(value:string){const at=Date.parse(value);return Number.isFinite(at)?new Date(at-6*3600000).toISOString().slice(0,16):value.slice(0,16);}
