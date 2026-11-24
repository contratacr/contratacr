import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ContactFormPublic} from '@/components/pro/contact-form-public';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Leads area: public page of a published contact form (no account). Local/test only while Pro is off in production.
export const metadata:Metadata={title:'Formulario de contacto · ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function ContactFormPage({params}:{params:Promise<{id:string}>}){
 if(!PRO_ENABLED)notFound();
 const {id}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
 return <ContactFormPublic formId={id.toLowerCase()}/>;
}
