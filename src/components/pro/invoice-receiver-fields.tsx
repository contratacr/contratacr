'use client';
import {useLocale} from 'next-intl';
import {emptyReceiverFiscal,type FiscalReceiver} from '@/lib/pro/client-fiscal';
import {FiscalIdentityLookup} from './fiscal-identity-lookup';
export function InvoiceReceiverFields({value,onChange,includeName=false}:{value:Partial<FiscalReceiver>;onChange:(value:Partial<FiscalReceiver>)=>void;includeName?:boolean}){
 const en=useLocale()==='en',t=(es:string,eng:string)=>en?eng:es;
 const field=(key:keyof FiscalReceiver,label:string,type='text',max=160)=><label className="block text-sm font-bold">{label}<input data-receiver-field={key} aria-label={label} type={type} autoCorrect="off" autoCapitalize="none" spellCheck={false} maxLength={max} value={value[key]??''} onChange={e=>onChange({...emptyReceiverFiscal(),...value,[key]:e.target.value})} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#e5e7eb] px-3 text-base font-normal"/></label>;
 return <div className="space-y-4">
 {includeName&&field('name',t('Nombre o razón social','Name or business name'))}
 <div className="grid items-end gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">{t('Tipo de identificación','Identification type')}<select aria-label={t('Tipo de identificación','Identification type')} value={value.identificationType??''} onChange={e=>onChange({...emptyReceiverFiscal(),...value,identificationType:e.target.value as FiscalReceiver['identificationType']})} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#e5e7eb] px-3 text-base font-normal"><option value="">{t('Por definir','To be defined')}</option><option value="individual">{t('Cédula física','Individual ID')}</option><option value="company">{t('Cédula jurídica','Company ID')}</option><option value="dimex">DIMEX</option><option value="nite">NITE</option><option value="foreign">{t('Identificación extranjera','Foreign identification')}</option></select></label>
 {field('identification',t('Identificación','Identification'),'text',40)}</div>
 <FiscalIdentityLookup value={value} onChange={onChange}/>
 {field('email',t('Correo para facturas','Invoice email'),'email',254)}
 {field('phone',t('Teléfono','Phone'),'tel',30)}
 <details className="rounded-xl border border-[#e5e7eb] p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{t('Dirección y actividad (opcionales)','Address and activity (optional)')}</summary><div className="mt-3 space-y-4">
 <div className="grid items-end gap-4 sm:grid-cols-2">{field('province',t('Provincia','Province'),'text',80)}{field('canton',t('Cantón','Canton'),'text',80)}{field('district',t('Distrito','District'),'text',80)}{field('neighborhood',t('Barrio','Neighborhood'),'text',100)}</div>
 {field('address',t('Dirección y señas','Address and directions'),'text',500)}
 {field('activity',t('Actividad económica (opcional)','Economic activity (optional)'),'text',12)}
 <p className="text-xs text-[#68778d]">{t('Escriba el domicilio y el código de actividad del cliente si los conoce. Puede completarlos después.','Enter the customer address and activity code if known. You can complete them later.')}</p>
 </div></details>
 </div>;
}
