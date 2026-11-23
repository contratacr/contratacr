import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {PoVendorPortal} from '@/components/pro/po-vendor-portal';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Row 51: public vendor page of a purchase order link (no ContrataCR account). Local development only.
export const metadata:Metadata={title:'Orden de compra · ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function PoVendorPortalPage(){
 if(!PRO_ENABLED)notFound();
 return <PoVendorPortal/>;
}
