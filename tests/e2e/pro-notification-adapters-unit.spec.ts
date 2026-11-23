import {test,expect} from 'playwright/test';
import {adapterFor,deliver,digestDue,inQuietHours,liveAdapter,scheduleSaveSchema,sandboxAdapter} from '../../src/lib/pro/notification-adapters';
import {taskRowsCsv} from '../../src/lib/pro/task-center-detail';

// Row 24 and row 15 pure rules: quiet hours in Costa Rica time, digest due hour, sandbox/live adapters and the task CSV.
// Costa Rica is UTC-6 without daylight saving: 03:00Z is 21:00 the day before, 13:00Z is 07:00.
const at=(iso:string)=>new Date(iso);
const night={quietEnabled:true,quietStart:'21:00',quietEnd:'07:00',quietWeekends:false};
test('quiet hours cross midnight and use Costa Rica time',()=>{
 expect(inQuietHours(night,at('2026-11-24T03:00:00Z'))).toBe(true);   // 21:00 Mon
 expect(inQuietHours(night,at('2026-11-24T10:00:00Z'))).toBe(true);   // 04:00 Tue
 expect(inQuietHours(night,at('2026-11-24T13:00:00Z'))).toBe(false);  // 07:00 Tue
 expect(inQuietHours(night,at('2026-11-24T18:00:00Z'))).toBe(false);  // noon
 expect(inQuietHours({...night,quietEnabled:false},at('2026-11-24T03:00:00Z'))).toBe(false);
 expect(inQuietHours({quietEnabled:true,quietStart:'12:00',quietEnd:'13:00',quietWeekends:false},at('2026-11-24T18:30:00Z'))).toBe(true);
});
test('weekend quiet applies all day Saturday and Sunday (CR)',()=>{
 const w={...night,quietWeekends:true};
 expect(inQuietHours(w,at('2026-11-28T18:00:00Z'))).toBe(true);  // Saturday noon
 expect(inQuietHours(w,at('2026-11-29T18:00:00Z'))).toBe(true);  // Sunday noon
 expect(inQuietHours(w,at('2026-11-30T18:00:00Z'))).toBe(false); // Monday noon
});
test('digest is due in its hour, weekly only on the chosen day',()=>{
 expect(digestDue({digestFrequency:'off',digestHour:7,digestWeekday:1},at('2026-11-23T13:00:00Z'))).toBe(false);
 expect(digestDue({digestFrequency:'daily',digestHour:7,digestWeekday:1},at('2026-11-24T13:30:00Z'))).toBe(true);
 expect(digestDue({digestFrequency:'daily',digestHour:7,digestWeekday:1},at('2026-11-24T14:00:00Z'))).toBe(false);
 expect(digestDue({digestFrequency:'weekly',digestHour:7,digestWeekday:1},at('2026-11-23T13:00:00Z'))).toBe(true);  // Monday
 expect(digestDue({digestFrequency:'weekly',digestHour:7,digestWeekday:1},at('2026-11-24T13:00:00Z'))).toBe(false); // Tuesday
});
test('sandbox adapter only simulates; live adapter without environment sends nothing; quiet hours defer',async()=>{
 const message={channel:'whatsapp' as const,subject:'s',body:'b'};
 expect((await sandboxAdapter('whatsapp').send(message)).status).toBe('simulated');
 expect(await liveAdapter('whatsapp',{}).send(message)).toMatchObject({mode:'live',status:'not_configured',detail:'missing_env'});
 expect(await liveAdapter('email',{PRO_NOTIFY_EMAIL_PROVIDER:'x',PRO_NOTIFY_EMAIL_SECRET:'y'}).send({...message,channel:'email'})).toMatchObject({status:'not_configured',detail:'provider_not_implemented'});
 expect(adapterFor('push').send(message)).resolves.toMatchObject({mode:'sandbox'});
 expect((await deliver(sandboxAdapter('push'),message,night,at('2026-11-24T04:00:00Z'))).status).toBe('quiet_hours');
 expect((await deliver(sandboxAdapter('push'),message,night,at('2026-11-24T04:00:00Z'),true)).status).toBe('simulated');
});
test('schedule save schema rejects equal quiet hours and unknown fields',()=>{
 const base={actionId:crypto.randomUUID(),revision:0,quietEnabled:true,quietStart:'21:00',quietEnd:'07:00',quietWeekends:false,digestFrequency:'daily' as const,digestHour:7,digestWeekday:1};
 expect(scheduleSaveSchema.safeParse(base).success).toBe(true);
 expect(scheduleSaveSchema.safeParse({...base,quietEnd:'21:00'}).success).toBe(false);
 expect(scheduleSaveSchema.safeParse({...base,quietStart:'25:00'}).success).toBe(false);
 expect(scheduleSaveSchema.safeParse({...base,extra:1}).success).toBe(false);
});
test('task CSV: bilingual header, escaping and formula neutralisation',()=>{
 const rows=[{title:'=SUM(A1)',job:'Cocina; "norte"',customer:'Ana',dueDate:'2026-12-01',status:'open' as const,assignee:'',phase:'Obra gris',plannedStart:'2026-11-25',plannedEnd:'2026-11-30'}];
 const es=taskRowsCsv(rows,false),en=taskRowsCsv(rows,true);
 expect(es.startsWith('﻿Tarea;Trabajo;Cliente;Fecha límite;Estado;Responsable;Fase;Inicio previsto;Fin previsto\r\n')).toBe(true);
 expect(en.split('\r\n')[0]).toBe('﻿Task;Job;Customer;Due date;Status;Assignee;Phase;Planned start;Planned end');
 expect(es).toContain("\r\n'=SUM(A1);");
 expect(es).toContain('"Cocina; ""norte"""');expect(es).toContain(';Pendiente;');expect(en).toContain(';Pending;');
});
