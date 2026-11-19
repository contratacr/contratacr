'use client';
import {useLocale} from 'next-intl';
import type {EditableInvoiceLine} from '@/lib/pro/invoice-detail';
import {VAT_OPTIONS,vatOptionLabel,EXEMPTION_DOCUMENTS,EXEMPTION_INSTITUTIONS,blankExemption,type InvoiceExemption,type InvoiceTax} from '@/lib/pro/invoice-tax';
export function InvoiceTaxFields({line,index,onChange,invalidKey}:{line:EditableInvoiceLine;index:number;onChange:(values:Partial<EditableInvoiceLine>)=>void;invalidKey?:string}){
 const en=useLocale()==='en',t=(es:string,eng:string)=>en?eng:es,exemption=line.tax?.exemption;
 const field='mt-1 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-base font-normal';
 const documentLabels:Record<string,[string,string]>={'02':['Diplomáticos','Diplomats'],'03':['Ley especial','Special law'],'04':['Autorización local genérica','Generic local authorization'],'08':['Zona franca','Free trade zone'],'09':['Servicios complementarios de exportación','Export complementary services'],'10':['Corporación municipal','Municipal corporation'],'99':['Otro documento','Other document']};
 const data=(key:string)=>({'data-line-index':index,'data-field':key,'aria-invalid':invalidKey===key||undefined,'aria-describedby':invalidKey===key?'pro-invoice-detail-error':undefined});
 function edit(values:Partial<InvoiceExemption>){if(line.tax&&exemption)onChange({tax:{...line.tax,exemption:{...exemption,...values}}});}
 function input(key:keyof InvoiceExemption,label:string,max:number,type='text'){
  return <label className="block min-w-0 text-sm font-bold">{label}<input {...data('tax.exemption.'+key)} aria-label={label} type={type} style={type==='date'?{appearance:'none',minWidth:0}:undefined} maxLength={max} autoCorrect="off" autoCapitalize="none" spellCheck={false} value={exemption?.[key]??''} onChange={e=>edit({[key]:e.target.value})} className={field}/></label>;
 }
 return <div className="space-y-3" data-invoice-tax="">
 {line.taxTreatment==='vat'&&<>
 <label className="block min-w-0 text-sm font-bold">{t('Tarifa de IVA','VAT tariff')}<select {...data('tax.vatCode')} aria-label={t('Tarifa de IVA','VAT tariff')} value={line.tax?.vatCode??''} onChange={e=>{const option=VAT_OPTIONS.find(option=>option.code===e.target.value);if(option)onChange({taxRate:option.rate,tax:{vatCode:option.code,exemption:line.tax?.exemption??null}});}} className={field}><option value="" disabled>{t('Seleccione una tarifa del catálogo','Select a catalog tariff')}</option>{VAT_OPTIONS.filter(option=>!['10','11'].includes(option.code)).map(option=><option key={option.code} value={option.code}>{vatOptionLabel(option.code,en)} · {option.code}</option>)}</select></label>
 {!line.tax&&<label className="block text-sm font-bold">{t('Tarifa IVA %','VAT rate %')}<input {...data('taxRate')} aria-label={t('Tarifa IVA %','VAT rate %')} value={line.taxRate} inputMode="decimal" maxLength={10} onChange={e=>onChange({taxRate:e.target.value})} className={field}/><span className="mt-1 block text-xs font-normal text-[#68778d]">{t('Tarifa manual conservada del borrador anterior. Elija una tarifa del catálogo para añadir una exoneración.','Manual rate retained from the earlier draft. Choose a catalog tariff to add an exemption.')}</span></label>}
 {line.tax&&(Number(line.taxRate)>0||!!exemption)&&<label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"><input {...data('tax.exemption')} aria-label={t('Aplicar exoneración','Apply exemption')} type="checkbox" checked={!!exemption} onChange={e=>onChange({tax:{...line.tax as InvoiceTax,exemption:e.target.checked?blankExemption():null}})} className="size-5 accent-[#00a4d3]"/>{t('Aplicar exoneración','Apply exemption')}</label>}
 </>}
 {line.tax&&['10','11'].includes(line.tax.vatCode)&&<p className="text-xs text-[#52627a]">{vatOptionLabel(line.tax.vatCode,en)} · {line.tax.vatCode}</p>}
 {exemption&&<div className="space-y-3 rounded-xl border border-[#d8e8ef] bg-white p-3" data-exemption="">
 <p className="text-xs text-[#52627a]">{t('Indique los datos de la autorización del cliente. La tarifa exonerada son puntos de IVA: 13 % menos 8 puntos deja 5 %.','Enter the customer authorization details. Exempted rate means VAT points: 13% minus 8 points leaves 5%.')}</p>
 <label className="block min-w-0 text-sm font-bold">{t('Tipo de documento de exoneración','Exemption document type')}<select {...data('tax.exemption.documentType')} aria-label={t('Tipo de documento de exoneración','Exemption document type')} className={field} value={exemption.documentType} onChange={e=>edit({documentType:e.target.value as InvoiceExemption['documentType'],documentOther:''})}><option value="">{t('Seleccione el documento','Select document')}</option>{EXEMPTION_DOCUMENTS.map(option=><option key={option.code} value={option.code}>{t(...documentLabels[option.code])} · {option.code}</option>)}</select></label>
 {exemption.documentType==='99'&&input('documentOther',t('Detalle del documento','Other document details'),100)}
 {input('documentNumber',t('Número de documento','Document number'),40)}
 <div className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2">{input('article',['02','03','08'].includes(exemption.documentType)?t('Artículo','Article'):t('Artículo (opcional)','Article (optional)'),6)}{input('paragraph',t('Inciso (opcional)','Paragraph (optional)'),6)}</div>
 <label className="block min-w-0 text-sm font-bold">{t('Institución','Institution')}<select {...data('tax.exemption.institution')} aria-label={t('Institución','Institution')} value={exemption.institution} onChange={e=>edit({institution:e.target.value as InvoiceExemption['institution'],institutionOther:''})} className={field}>{EXEMPTION_INSTITUTIONS.map(option=><option key={option.code} value={option.code}>{option.label} · {option.code}</option>)}</select></label>
 {exemption.institution==='99'&&input('institutionOther',t('Detalle de la institución','Other institution details'),160)}
 {input('issuedOn',t('Fecha de autorización','Authorization date'),10,'date')}
 {input('rate',t('Tarifa exonerada (puntos de IVA)','Exempted rate (VAT points)'),5)}
 <p className="text-xs text-[#68778d]">{t('El monto exonerado se calcula sobre la base de esta línea después del descuento. La autorización y su vigencia requieren revisión; no se consultan registros fiscales.','The exempted amount is calculated from this line’s base after discount. Authorization and validity require review; fiscal registries are not queried.')}</p>
 </div>}
 </div>;
}
