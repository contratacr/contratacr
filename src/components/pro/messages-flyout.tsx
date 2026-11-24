'use client';
import {useEffect,useState} from 'react';
import {navigatePro} from '@/lib/pro/navigation';
import {notificationPageSchema,type NotificationItem} from '@/lib/pro/round9';
import {commentEvents} from '@/lib/pro/notification-tabs';
import {openNotification} from './notification-center';

/** Area A: "Messages" flyout of the Pro header. Lists the latest messages and replies from customers (the comment notices). */
export function MessagesFlyout({en,close}:{en:boolean;close:()=>void}){
 const t=(es:string,english:string)=>en?english:es,[items,setItems]=useState<NotificationItem[]|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true;fetch('/api/pro/notifications?view=all',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(body=>{if(alive)setItems(notificationPageSchema.parse(body).items.filter(item=>commentEvents.includes(item.event)).slice(0,8));}).catch(()=>{if(alive)setFailed(true);});return()=>{alive=false;};},[]);
 const date=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
 return <div data-messages-flyout className="space-y-2">
  <h2 className="px-2 text-xs font-bold uppercase tracking-wide text-[#68778d]">{t('Mensajes de clientes','Customer messages')}</h2>
  {failed&&<p role="alert" className="p-2 text-sm text-red-700">{t('No se pudieron cargar los mensajes.','Messages could not be loaded.')}</p>}
  {!failed&&items===null&&<p role="status" className="p-2 text-sm text-[#52627a]">{t('Cargando mensajes…','Loading messages…')}</p>}
  {items&&items.length===0&&<p data-messages-empty className="p-2 text-sm text-[#52627a]">{t('No hay mensajes de clientes todavía.','There are no customer messages yet.')}</p>}
  {items&&items.length>0&&<ul>{items.map(item=><li key={item.id}><button type="button" data-message-item={item.id} onClick={()=>{close();void (item.read?Promise.resolve():fetch('/api/pro/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'read',actionId:crypto.randomUUID(),ids:[item.id]})}).catch(()=>{})).finally(()=>openNotification(item,en));}} className="block min-h-11 w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-[#f3f8fb]"><span className={`block break-words ${item.read?'font-normal':'font-bold'} text-[#162543]`}>{item.title}</span>{item.body&&<span className="block break-words text-xs text-[#52627a]">{item.body}</span>}<span className="block text-xs text-[#68778d]">{date(item.createdAt)}</span></button></li>)}</ul>}
  <button type="button" data-messages-all onClick={()=>{close();navigatePro('pro_notifications',{pestana:'comments'});}} className="min-h-11 w-full rounded-xl px-2 py-2 text-left text-sm font-semibold text-[#006f93] hover:bg-[#f3f8fb]">{t('Ver todos los comentarios','See all comments')}</button>
 </div>;
}
