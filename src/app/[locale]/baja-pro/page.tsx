import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {MarketingUnsubscribe} from '@/components/pro/marketing-unsubscribe';

// Round 6D (row 71): unsubscribe page of a professional's campaign emails (/baja-pro#t=…). Local only; not indexed.
export const metadata:Metadata={title:'Darse de baja · ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function MarketingUnsubscribePage(){
 if(process.env.NODE_ENV!=='development')notFound();
 return <MarketingUnsubscribe/>;
}
