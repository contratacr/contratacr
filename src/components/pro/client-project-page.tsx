'use client';
import {useCallback} from 'react';
import {useLocale} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {CabeceraDeTramite} from '@/components/layout/focused-header';
import {AppointmentRequestDetail} from './appointment-requests-workspace';
import {takeClientProjectFromApp} from '@/lib/pro/client-project-route';

/** Fix 14: page shell of «Mi proyecto». The content is the same customer detail the dialog showed. */
export function ClientProjectPage({requestId,origin}:{requestId:string;origin?:string|null}){
 const en=useLocale()==='en',router=useRouter();
 const leave=useCallback(()=>{
  // Opened from the customer's list (or its old dialog address) in this document: go back there; a direct link goes to the list:
  // «Mis proyectos» for a job the customer joined by invitation, «Mis citas» for a booked appointment.
  if(takeClientProjectFromApp(requestId)&&window.history.length>1){router.back();return;}
  router.replace(origin==='project_invite'?'/dashboard/profesional?tab=sent_projects':'/dashboard/profesional?tab=appointments');
 },[origin,requestId,router]);
 return <div className="min-h-screen bg-[#f7f9fc] text-[#162543]">
  <CabeceraDeTramite title={en?'My project':'Mi proyecto'} backLabel={en?'Back':'Volver'} onBack={leave}/>
  <AppointmentRequestDetail id={requestId} side="client" presentation="page" onChanged={()=>{}} onClose={leave}/>
 </div>;
}
