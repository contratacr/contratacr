import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {BidVendorPortal} from '@/components/pro/bid-vendor-portal';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Row 53: public vendor page of a bid invitation. Local development only.
export const metadata:Metadata={title:'Invitación a licitar · ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function BidVendorPortalPage(){
 if(!PRO_ENABLED)notFound();
 return <BidVendorPortal/>;
}
