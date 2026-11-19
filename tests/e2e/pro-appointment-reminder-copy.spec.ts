import {test, expect} from 'playwright/test';
import {localizedNotificationCopy, TRANSLATED_NOTIFICATION_TYPES} from '../../src/lib/localized-notification';
import {notificationHref, notificationActionHref, notificationActionLabel, notificationContext} from '../../src/lib/notification-link';
const request_id='82000000-0000-4000-8000-000000000001';
const data={version:1,request_id,action:'reminder_24h',invalidated:false,link:'https://invalid.example',note:'PRIVATE'};
for(const [type,tab,context] of [['pro_appointment_reminder_provider','pro_agenda','professional'],['pro_appointment_reminder_client','appointments','client']] as const){
 test(`${type} uses recipient routes and localized private-safe text`,()=>{
  expect(TRANSLATED_NOTIFICATION_TYPES.has(type)).toBe(true);
  expect(notificationContext(type)).toBe(context);
  for(const locale of ['es','en']){
   for(const invalidated of [false,true]){
    const n={type,title:'PRIVATE',message:'PRIVATE',data:{...data,invalidated}};
    expect(notificationHref(n,undefined,locale)).toBe(`${locale==='en'?'/en':''}/dashboard/profesional?tab=${tab}&citaSolicitud=${request_id}`);
    expect(notificationActionLabel(n,undefined,locale)).toBe(locale==='en'?'View appointment':'Ver cita');
    const copy=localizedNotificationCopy(n,locale);
    expect(JSON.stringify(copy)).not.toContain('PRIVATE');
    expect(copy.title).toBe(locale==='en'?(invalidated?'Previous appointment reminder':'Upcoming appointment'):(invalidated?'Recordatorio anterior de cita':'Tiene una cita próxima'));
   }
  }
 });
 test(`${type} malformed reminders never route or render private fallback`,()=>{
  for(const value of [null,{}, {...data,invalidated:'false'},{...data,action:'confirmed'},{...data,version:2},{...data,request_id:'../../private'}]){
   const n={type,title:'PRIVATE',message:'PRIVATE',data:value};
   expect(notificationActionHref(n,undefined,'en')).toBeNull();
   expect(notificationActionLabel(n,undefined,'en')).toBeNull();
   expect(notificationHref(n,undefined,'en')).toBe('/en/notificaciones');
   expect(localizedNotificationCopy(n,'en')).toEqual({title:'Appointment update',message:'Open Appointments to review the current details.'});
  }
 });
}
