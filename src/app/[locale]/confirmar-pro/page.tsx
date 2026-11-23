import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {MarketingConfirm} from '@/components/pro/marketing-confirm';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Post-security fixes (2026-11-13): confirmation page of a site-form email subscription (/confirmar-pro#t=…, double
// opt-in, Ley 8968). Local only; not indexed.
export const metadata:Metadata={title:'Confirmar suscripción · ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function MarketingConfirmPage(){
 if(!PRO_ENABLED)notFound();
 return <MarketingConfirm/>;
}
