'use client';
import {useLocale} from 'next-intl';
import type {InvoiceIssuer} from '@/lib/pro/invoice-preparation';
const field='mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-base font-normal';
export function InvoiceIssuerFields({value,onChange}:{value:InvoiceIssuer;onChange:(value:InvoiceIssuer)=>void}){
 const en=useLocale()==='en',t=(es:string,eng:string)=>en?eng:es;
 function text(key:keyof InvoiceIssuer,label:string,maxLength:number,type='text'){return <label className="block text-sm font-bold">{label}<input data-issuer-field={key} autoCorrect="off" autoCapitalize="none" spellCheck={false} aria-label={label} value={value[key]} type={type} maxLength={maxLength} onChange={e=>onChange({...value,[key]:e.target.value})} className={field}/></label>;}
 return <div className="space-y-3">
 {text('issuerName',t('Nombre o razón social del emisor','Issuer legal name'),160)}
 <label className="block text-sm font-bold">{t('Tipo de identificación del emisor','Issuer identification type')}<select aria-label={t('Tipo de identificación del emisor','Issuer identification type')} value={value.issuerIdType} onChange={e=>onChange({...value,issuerIdType:e.target.value as InvoiceIssuer['issuerIdType']})} className={field}><option value="">{t('Por definir','To be defined')}</option><option value="individual">{t('Persona física','Individual')}</option><option value="company">{t('Persona jurídica','Company')}</option><option value="dimex">DIMEX</option><option value="nite">NITE</option><option value="foreign">{t('Identificación extranjera','Foreign identification')}</option></select></label>
 {text('issuerId',t('Identificación del emisor','Issuer identification'),40)}
 {text('issuerEmail',t('Correo del emisor','Issuer email'),254,'email')}{text('issuerPhone',t('Teléfono del emisor (opcional)','Issuer phone (optional)'),30,'tel')}
 {text('issuerAddress',t('Dirección del emisor','Issuer address'),500)}{text('issuerActivity',t('Código de actividad económica','Economic activity code'),12)}
 </div>;
}
