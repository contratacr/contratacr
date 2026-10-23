'use client';
import {useState,useRef} from 'react';
import {Button} from '@/components/ui/button';
export function MembershipAdmin(){
 const formRef=useRef<HTMLFormElement>(null);
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 return <section className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-6"><h2 className="text-xl font-bold text-[#162543]">Acceso Pro</h2><p className="text-sm text-[#68778d]">Los administradores tienen acceso para pruebas. Active o suspenda Pro para una cuenta sin cambiar su rol.</p>
 <form ref={formRef} className="grid gap-4 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setMessage('');try{const response=await fetch('/api/admin/pro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'membership',userId:f.get('userId'),status:f.get('status'),expiresAt:f.get('expiresAt')?new Date(String(f.get('expiresAt'))+'T23:59:59-06:00').toISOString():null,reason:f.get('reason')})});const result=await response.json();if(!response.ok)throw Error(result.error);setMessage('Acceso actualizado y registrado en el historial.');}catch(e){setMessage(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);}}}>
 <label>ID de cuenta<input name="userId" required pattern="[0-9a-fA-F-]{36}" className="mt-1 block w-full rounded-xl border p-3"/></label>
 <label>Estado<select name="status" className="mt-1 block w-full rounded-xl border p-3"><option value="active">Activo</option><option value="inactive">Suspendido</option></select></label>
 <label>Vence al finalizar el día · Costa Rica (opcional)<input name="expiresAt" type="date" className="mt-1 block w-full rounded-xl border p-3"/></label>
 <label>Motivo<input name="reason" required maxLength={1000} className="mt-1 block w-full rounded-xl border p-3"/></label>
 <Button type="button" variant="secondary" disabled={busy} onClick={async()=>{const id=String(new FormData(formRef.current!).get('userId')||'');setBusy(true);try{const r=await fetch('/api/admin/pro?userId='+encodeURIComponent(id),{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error);setMessage(`${b.profile.full_name||'Cuenta'} · ${b.profile.is_disabled?'Deshabilitada':b.profile.role==='admin'?'Administrador: acceso incluido':b.membership?.status==='active'?'Pro activo':'Sin Pro activo'}${b.membership?.expires_at?' · Vence '+new Date(b.membership.expires_at).toLocaleDateString('es-CR',{timeZone:'America/Costa_Rica'}):''}`);}catch(e){setMessage(e instanceof Error?e.message:'No se pudo consultar.');}finally{setBusy(false);}}}>Consultar cuenta</Button>
 <Button disabled={busy}>{busy?'Guardando…':'Guardar acceso'}</Button></form>{message&&<p role="status">{message}</p>}</section>;
}
