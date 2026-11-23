import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {PaymentLinkPortal} from '@/components/pro/payment-link-portal';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6A: public hosted page of a payment link (/pagar#enlace=…). Local development only.
export const metadata:Metadata={title:'Pago en línea · ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function PaymentLinkPage(){
 if(!PRO_ENABLED)notFound();
 return <PaymentLinkPortal/>;
}
