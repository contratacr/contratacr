import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {MarketingConfirm} from '@/components/pro/marketing-confirm';

// Post-security fixes (2026-11-13): confirmation page of a site-form email subscription (/confirmar-pro#t=…, double
// opt-in, Ley 8968). Local only; not indexed.
export const metadata:Metadata={title:'Confirmar suscripción · ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function MarketingConfirmPage(){
 if(process.env.NODE_ENV!=='development')notFound();
 return <MarketingConfirm/>;
}
