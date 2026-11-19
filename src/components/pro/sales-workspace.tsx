'use client';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {StatusFilterTabs} from '@/components/dashboard/status-filter-tabs';
import {navigatePro,pushProParams,replaceProParams,proDashboardPath} from '@/lib/pro/navigation';
import {ConnectedQuotes} from './connected-quotes';
import {InvoiceWorkspace} from './invoice-workspace';
import {PaymentOverview} from './payment-overview';
import {PaymentReceiptsWorkspace} from './payment-receipts';
import {useProSearchParams} from './use-pro-search-params';
import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@/hooks/use-auth';
import {privateEstimateDetailSchema,type PrivateEstimate} from '@/lib/pro/private-estimates';
import {createPrivateEstimatePdf} from '@/lib/pro/private-estimate-export';
import {PrivateEstimatesWorkspace,type PrivateEstimateSalesRow} from './private-estimates-workspace';

const detailParams=['nueva','cotizacion','factura','pago','pagos','recibos','recibo','recurrencias','recurrente','emisor','configDocumento','plantillaServicios','descuentoCatalogo'];
export function SalesWorkspace({proName,proSlug,puedeCrear=true,privateEstimates=false,disabled=false}:{proName:string;proSlug?:string|null;puedeCrear?:boolean;privateEstimates?:boolean;disabled?:boolean}){
 const en=useLocale()==='en',params=useProSearchParams(),tab=params.get('tab');
 const {user}=useAuth(),current=useRef({actor:user?.id,live:true}),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState(''),exportMutex=useRef(false);
 useEffect(()=>{current.current={actor:user?.id,live:true};return()=>{current.current.live=false;};},[user?.id]);
 const view=tab==='pro_billing'?'invoices':tab==='pro_payments'?'payments':'quotes';
 const detailOpen=detailParams.some(key=>!!params.get(key));
 const tabs=[{view:'invoices',tab:'pro_billing',label:en?'Invoice drafts':'Borradores'},{view:'payments',tab:'pro_payments',label:en?'Payments':'Pagos'}] as const;
 // Round 7A: ONE quote flow. In the Pro space the old «quote with link» editor (nueva=1) is retired:
 // every entry point lands in the full quote editor with the same customer (and lead, when known).
 // Earlier quotes with link stay readable (cotizacion=… legacy=1).
 const retiredEditor=privateEstimates&&params.get('nueva')==='1';
 useEffect(()=>{if(!retiredEditor)return;const timer=setTimeout(()=>{
  const lead=params.get('solicitudManualOrigen'),revision=params.get('revisionSolicitudManual'),back=['volverSolicitudManual','volverSolicitud','volverProyecto','volverCliente'].map(key=>proDashboardPath(params.get(key))).find(Boolean)??null;
  const manual=!!lead&&/^[0-9a-f-]{36}$/i.test(lead)&&/^[1-9][0-9]*$/.test(revision??'');
  replaceProParams({nueva:null,cliente:null,solicitudOrigen:null,volverSolicitud:null,proyectoOrigen:null,volverProyecto:null,solicitudManualOrigen:null,revisionSolicitudManual:null,volverSolicitudManual:null,volverCliente:null,
   nuevaEstimacion:crypto.randomUUID(),estimacionPrivada:null,cotizacionCliente:params.get('cliente'),origenEstimacion:manual?'manual':null,idOrigenEstimacion:manual?lead:null,revisionOrigenEstimacion:manual?revision:null,huellaOrigenEstimacion:null,volverEstimacion:back});
 },0);return()=>clearTimeout(timer);},[retiredEditor,params]);
 const legacyQuoteOpen=!retiredEditor&&(!!params.get('nueva')||!!params.get('cotizacion')||!!params.get('plantillaServicios'));
 const openLegacy=(row:PrivateEstimateSalesRow)=>{if(exportMutex.current)return;pushProParams({cotizacion:row.id,legacy:row.kind==='legacy'?'1':null,nueva:null,nuevaEstimacion:null,estimacionPrivada:null,cotizacionCliente:null,origenEstimacion:null,idOrigenEstimacion:null,revisionOrigenEstimacion:null,huellaOrigenEstimacion:null,volverEstimacion:null});};
 async function exportEstimate(estimate:PrivateEstimate){
  const actor=user?.id;if(exportMutex.current||!actor||estimate.ownerId!==actor)return;
  exportMutex.current=true;setExporting(true);setExportError('');
  const currentAccount=()=>current.current.live?current.current.actor:undefined;
  try{
   const blob=await createPrivateEstimatePdf(estimate,{english:en,accountId:actor,currentAccount,verifySaved:async()=>{
    const response=await fetch('/api/pro/private-estimates?'+new URLSearchParams({view:'detail',estimateId:estimate.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});
    if(!response.ok)throw Error('Saved quote unavailable');return privateEstimateDetailSchema.parse(await response.json()).estimate;
   }});
   if(currentAccount()!==actor)return;
   const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`${en?'estimate':'cotizacion'}-${estimate.id.slice(0,8)}-v${estimate.revision}-${estimate.currency}.pdf`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{if(currentAccount()===actor)setExportError(en?'Could not export this saved version. Refresh the preview and try again.':'No se pudo exportar esta versión guardada. Actualice la vista previa y reintente.');}
  finally{exportMutex.current=false;if(currentAccount()===actor)setExporting(false);}
 }
 return <section aria-label={en?'Sales and payments':'Ventas y cobros'} className="space-y-4" data-pro-sales-workspace>
  {exportError&&<p role="alert">{exportError}</p>}{exporting&&<p role="status">{en?'Preparing PDF…':'Preparando PDF…'}</p>}
  {!detailOpen&&view!=='quotes'&&<nav aria-label={en?'Sales and payments sections':'Secciones de ventas y cobros'}><StatusFilterTabs tabs={tabs.map(item=>({id:item.view}))} value={view} labelFor={id=>tabs.find(item=>item.view===id)!.label} onChange={id=>{const item=tabs.find(item=>item.view===id);if(item&&view!==item.view)navigatePro(item.tab);}} variant="pills" limpiable={false} currentAsPage/></nav>}
  {view==='quotes'?(retiredEditor?<p role="status" className="text-sm">{en?'Opening the quote editor…':'Abriendo el editor de cotizaciones…'}</p>:privateEstimates&&!legacyQuoteOpen?<PrivateEstimatesWorkspace headerActionsId={privateEstimates?"pro-estimate-actions":undefined} ownerName={proName} blocked={exporting||disabled} exportError={exportError} onOpenLegacy={openLegacy} onExport={estimate=>void exportEstimate(estimate)}/>:<ConnectedQuotes proName={proName} proSlug={proSlug} puedeCrear={puedeCrear}/>):view==='invoices'?<InvoiceWorkspace/>:<div className="space-y-4">
   <p className="text-sm text-[#52627a]">{en?'Review payments you have received. Open a customer to record a job payment or check their outstanding balance.':'Consulte los pagos recibidos. Abra un cliente para registrar un abono a su trabajo o revisar su saldo pendiente.'}</p>
   {!detailOpen&&<div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={()=>navigatePro('pro_clients')}>{en?'View customers and balances':'Ver clientes y saldos'}</Button><Button type="button" variant="secondary" onClick={()=>pushProParams({recibos:'1'})}>{en?'Payment receipts':'Recibos de pagos'}</Button></div>}
   <PaymentOverview presentation="embedded"/>
   <PaymentReceiptsWorkspace/>
  </div>}
 </section>;
}
