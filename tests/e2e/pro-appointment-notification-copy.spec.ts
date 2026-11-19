import {test,expect} from 'playwright/test';
import {appointmentNotificationActions} from '../../src/lib/pro/appointment-notification';
import {localizedNotificationCopy,TRANSLATED_NOTIFICATION_TYPES} from '../../src/lib/localized-notification';
import {notificationHref,notificationActionHref,notificationActionLabel,notificationContext,notificationInMode} from '../../src/lib/notification-link';
const request_id='82000000-0000-4000-8000-000000000001';
const data={version:1,request_id,action:'confirmed',link:'https://invalid.example/private',note:'PRIVATE_NOTE',service:'PRIVATE_SERVICE'};
for(const [type,tab,context] of [['pro_appointment_provider','pro_agenda','professional'],['pro_appointment_client','appointments','client']] as const){
 test(`${type} routes by recipient and UUID, never supplied link`,()=>{
  // PostgreSQL accepts canonical UUIDs without enforcing version/variant bits.
  for(const canonical of ['00000000-0000-0000-0000-000000000000','abcdef01-2345-0678-0123-abcdef012345']){
   expect(notificationActionHref({type,data:{...data,request_id:canonical}},undefined,'en')).toBe(`/en/dashboard/profesional?tab=${tab}&citaSolicitud=${canonical}`);
  }
  expect(notificationContext(type)).toBe(context);
  expect(notificationInMode(type,'offer')).toBe(context==='professional');
  expect(notificationInMode(type,'use')).toBe(context==='client');
  for(const locale of ['es','en']){
   const n={type,data};
   expect(notificationHref(n,undefined,locale)).toBe(`${locale==='en'?'/en':''}/dashboard/profesional?tab=${tab}&citaSolicitud=${request_id}`);
   expect(notificationActionLabel(n,undefined,locale)).toBe(locale==='en'?'View appointment':'Ver cita');
  }
 });
 test(`${type} translates all events without private fallback content`,()=>{
  expect(TRANSLATED_NOTIFICATION_TYPES.has(type)).toBe(true);
  for(const action of appointmentNotificationActions){
   const n={type,title:'PRIVATE_TITLE',message:'PRIVATE_MESSAGE',data:{...data,action}};
   const es=localizedNotificationCopy(n,'es'),en=localizedNotificationCopy(n,'en');
   expect(es.title).not.toBe(en.title);expect(es.message).not.toBe(en.message);
   expect(JSON.stringify([es,en])).not.toContain('PRIVATE');
   expect(en.title).not.toMatch(/cita|horario|solicitud/i);
  }
  // A proposal may be declined or withdrawn after its appointment is cancelled
  // or completed. Neither event guarantees that the old time is still confirmed.
  for(const action of ['reschedule_declined','reschedule_withdrawn']){
   for(const status of ['cancelled','completed']){
    const n={type,title:'',message:'',data:{...data,action,status}};
    expect(localizedNotificationCopy(n,'en').message).toBe('The proposed change was not applied. Check the appointment status.');
    expect(localizedNotificationCopy(n,'es').message).toBe('El cambio propuesto no se aplicó. Consulte el estado de la cita.');
   }
  }
 });
 test(`${type} malformed payload is safely non-navigable`,()=>{
  for(const invalid of [null,{}, {...data,version:2},{...data,version:'1'},{...data,request_id:'../../private'},{...data,request_id:''},{...data,action:'unknown'}]){
   const n={type,title:'PRIVATE_TITLE',message:'PRIVATE_MESSAGE',data:invalid};
   expect(notificationActionHref(n,undefined,'en')).toBeNull();
   expect(notificationActionLabel(n,undefined,'en')).toBeNull();
   expect(notificationHref(n,undefined,'en')).toBe('/en/notificaciones');
   expect(localizedNotificationCopy(n,'en')).toEqual({title:'Appointment update',message:'Open Appointments to review the current details.'});
  }
 });
}
test('existing notification routing remains intact',()=>{
 expect(notificationHref({type:'new_job',data:{job_id:'job-1'}},undefined,'en')).toBe('/en/empleos?job=job-1');
 expect(notificationContext('review_received')).toBe('professional');
});
