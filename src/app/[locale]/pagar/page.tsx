import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {PaymentLinkPortal} from '@/components/pro/payment-link-portal';

// Round 6A: public hosted page of a payment link (/pagar#enlace=…). Local development only.
export const metadata:Metadata={title:'Pago en línea · ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function PaymentLinkPage(){
 if(process.env.NODE_ENV!=='development')notFound();
 return <PaymentLinkPortal/>;
}
