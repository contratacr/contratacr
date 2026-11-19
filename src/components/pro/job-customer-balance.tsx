'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {proMoney} from '@/lib/pro/money';

type Balance={workId:string;agreedCents:number|null;paidCents:number;creditNotesCents:number;customerBalanceCents:number|null;creditCents:number};
/** Live customer balance of a job (same formula as the customer record and the statement). */
export function JobCustomerBalance({workId}:{workId:string}){
 const en=useLocale()==='en',[data,setData]=useState<Balance|null>(null);
 useEffect(()=>{let alive=true;fetch('/api/pro/client-balance?'+new URLSearchParams({workId}),{cache:'no-store'}).then(r=>r.ok?r.json():null).then((body:Balance|null)=>{if(alive&&body?.workId===workId)setData(body);}).catch(()=>{});return()=>{alive=false;};},[workId]);
 if(!data||data.customerBalanceCents===null)return null;
 const money=(cents:number)=>proMoney(cents/100);
 return <div data-job-customer-balance>{en?'Current customer balance on this job: ':'Saldo actual del cliente en este trabajo: '}<strong>{money(data.customerBalanceCents)}</strong><span className="block text-xs text-[#52627a]">{en?`Agreed ${money(data.agreedCents??0)} − payments ${money(data.paidCents)}${data.creditNotesCents?` − credit notes ${money(data.creditNotesCents)}`:''}. Same figure as the customer record and the statement.`:`Acordado ${money(data.agreedCents??0)} − abonos ${money(data.paidCents)}${data.creditNotesCents?` − notas de crédito ${money(data.creditNotesCents)}`:''}. Es la misma cifra de la ficha del cliente y del estado de cuenta.`}</span></div>;
}
