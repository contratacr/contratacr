'use client';
import type {ReactNode} from 'react';

/**
 * LOCAL PRO ONLY (multivertical F5): «Llamar» / WhatsApp link that first records the contact of this device with the
 * place (POST /api/lugar/<slug>/contacto, keepalive). The record is what later allows a review without an account.
 * The navigation never waits for it and never fails because of it.
 */
export function PlaceContactLink({slug,href,channel,className,children}:{slug:string;href:string;channel:'call'|'whatsapp';className?:string;children:ReactNode}){
 const record=()=>{try{void fetch(`/api/lugar/${encodeURIComponent(slug)}/contacto`,{method:'POST',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({channel})}).catch(()=>{});}catch{/* ignore */}};
 return <a href={href} className={className} onClick={record} data-place-contact={channel}>{children}</a>;
}
