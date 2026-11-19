import type {EinvoiceResponse} from '@/lib/pro/integrations/hacienda/api';

/** Ronda F2-A: copy of the electronic-invoice screens (ES/EN records, «usted», straight ASCII quotes). */
type Copy={es:string;en:string};
const c=(es:string,en:string):Copy=>({es,en});
export const EINVOICE_COPY={
 title:c('Factura electrónica','Electronic invoice'),close:c('Cerrar','Close'),loading:c('Cargando…','Loading…'),loadFailed:c('No se pudo cargar la emisión.','Could not load issuing.'),retry:c('Reintentar','Retry'),
 failed:c('No se pudo completar la operación.','The operation could not be completed.'),unconfirmed:c('No se pudo comprobar el resultado. Reintente: no se duplicará.','Could not confirm the result. Retry: it will not be duplicated.'),
 testNotice:c('Modo de prueba: no se envía a Hacienda. Los comprobantes no tienen validez fiscal.','Test mode: nothing is sent to Hacienda. Documents have no fiscal validity.'),
 liveNotice:c('Se enviará a Hacienda con validez fiscal.','It will be sent to Hacienda with fiscal validity.'),liveBanner:c('Producción: comprobantes con validez fiscal.','Production: documents with fiscal validity.'),
 lockNotice:c('Después de emitir, el borrador queda bloqueado: para corregirlo se emite una nota de crédito o de débito.','After issuing, the draft is locked: corrections are made with a credit or debit note.'),
 confirmInvoice:c('¿Emitir factura electrónica?','Issue electronic invoice?'),confirmTicket:c('¿Emitir tiquete electrónico?','Issue electronic ticket?'),
 issueInvoice:c('Emitir factura','Issue invoice'),issueTicket:c('Emitir tiquete','Issue ticket'),emitInvoice:c('Emitir factura electrónica','Issue electronic invoice'),emitTicket:c('Emitir tiquete electrónico','Issue electronic ticket'),
 issued:c('Comprobante emitido y recibido. Consulte su estado para ver la respuesta.','Document issued and received. Check its status to see the answer.'),statusUpdated:c('Estado actualizado.','Status updated.'),
 creditIssued:c('Nota de crédito emitida y recibida.','Credit note issued and received.'),debitIssued:c('Nota de débito emitida y recibida.','Debit note issued and received.'),
 providerLabel:c('Proveedor:','Provider:'),modeLabel:c('Modo:','Mode:'),modeTest:c('Prueba (simulación local)','Test (local simulation)'),modeSandbox:c('Ambiente de pruebas de Hacienda','Hacienda test environment'),modeLive:c('Producción','Production'),
 missingKeys:c('Faltan las claves de este modo en el servidor; la emisión está detenida.','The keys for this mode are missing on the server; issuing is stopped.'),
 productionRefused:c('Producción no está habilitada en este servidor.','Production is not enabled on this server.'),disabled:c('La integración está desactivada.','The integration is disabled.'),
 noSettings:c('Antes de emitir, complete los datos del emisor (identificación, actividad económica, ubicación, sucursal y terminal).','Before issuing, complete the issuer details (identification, economic activity, location, branch and terminal).'),
 goSettings:c('Ir a Facturación electrónica','Go to Electronic invoicing'),emitTitle:c('Emitir desde este borrador','Issue from this draft'),
 emitHelp:c('Hasta emitir, este borrador sigue siendo interno y editable. Total:','Until issued, this draft stays internal and editable. Total:'),
 ready:c('Listo para emitir: datos completos y totales verificados.','Ready to issue: details complete and totals verified.'),ticketHelp:c('El tiquete no exige identificar al receptor.','A ticket does not require an identified recipient.'),
 locked:c('Este borrador ya tiene un comprobante. Su contenido quedó bloqueado; para corregirlo emita una nota de crédito o de débito.','This draft already has a document. Its content is locked; issue a credit or debit note to correct it.'),
 documents:c('Comprobantes','Documents'),vat:c('IVA','VAT'),consecutivo:c('Consecutivo','Sequence number'),clave:c('Clave numérica','Numeric key (clave)'),issuedAt:c('Fecha de emisión','Issue date'),
 reference:c('Referencia','Reference'),debitReference:c('Corrige monto (cargo adicional)','Corrects the amount (additional charge)'),
 retryNotice:c('Envío fallido; se reintenta con espera creciente. Intentos:','Sending failed; it retries with increasing waits. Attempts:'),nextAttempt:c('próximo intento','next attempt'),
 timeline:c('Historial de estados','Status history'),responses:c('Respuestas del proveedor','Provider responses'),attempt:c('intento','attempt'),
 retrySend:c('Reintentar envío','Retry sending'),checkStatus:c('Consultar estado','Check status'),downloadXml:c('Descargar XML firmado','Download signed XML'),
 downloadResponse:c('Respuesta de Hacienda (XML)','Hacienda response (XML)'),print:c('Imprimir o PDF','Print or PDF'),creditNote:c('Nota de crédito','Credit note'),debitNote:c('Nota de débito','Debit note'),
 credited:c('Acreditado:','Credited:'),debited:c('Debitado:','Debited:'),noteType:c('Tipo de nota','Note type'),cancelWhole:c('Anular el comprobante completo','Cancel the whole document'),
 creditLines:c('Acreditar líneas','Credit lines'),linesToCredit:c('Líneas a acreditar','Lines to credit'),reason:c('Motivo (5 a 180 caracteres)','Reason (5–180 characters)'),
 issueCredit:c('Emitir nota de crédito','Issue credit note'),issueDebit:c('Emitir nota de débito','Issue debit note'),cancel:c('Cancelar','Cancel'),
 debitHelp:c('Un cargo adicional sobre el comprobante aceptado. Usa el CAByS y la tarifa de IVA de la línea que elija.','An additional charge on the accepted document. It uses the CAByS and VAT rate of the line you choose.'),
 debitLine:c('Línea del original','Original line'),debitAmount:c('Monto sin IVA (colones)','Amount before VAT (colones)'),
} as const;
export const EINVOICE_PROVIDER_LABELS:Record<'mock'|'hacienda-sandbox'|'gti',Copy>={mock:c('Simulador local de Hacienda','Local Hacienda simulator'),'hacienda-sandbox':c('Hacienda (ATV) directo','Hacienda (ATV) direct'),gti:c('GTI (proveedor autorizado)','GTI (authorized provider)')};
export const EINVOICE_ERRORS:Record<string,Copy>={
 pro_einvoice_emitted:c('Este borrador ya tiene un comprobante emitido. Para corregirlo emita una nota de crédito.','This draft already has an issued document. Correct it with a credit note.'),
 pro_einvoice_settings:c('Complete los datos del emisor en Empresa › Facturación electrónica.','Complete the issuer details in Company › Electronic invoicing.'),
 pro_einvoice_archived:c('Restaure el borrador antes de emitir.','Restore the draft before issuing.'),pro_einvoice_reference_state:c('Solo se acredita o debita una factura o tiquete aceptado por Hacienda.','Only a document accepted by Hacienda can be credited or debited.'),
 pro_einvoice_credit_exceeds:c('La nota supera lo que queda por acreditar del original.','The note exceeds what is left to credit on the original.'),
 pro_einvoice_reference_cancelled:c('El original fue anulado con una nota de crédito: no admite notas de débito.','The original was cancelled with a credit note: it does not accept debit notes.'),
 pro_einvoice_debit_amount:c('La nota de débito debe ser mayor que cero.','The debit note must be greater than zero.'),pro_einvoice_totals:c('El total cambió. Vuelva a abrir el borrador.','The total changed. Reopen the draft.'),
 missing_keys:c('Faltan las claves de Hacienda en el servidor para el modo elegido.','The Hacienda keys for the selected mode are missing on the server.'),production_refused:c('Producción no está habilitada en este servidor.','Production is not enabled on this server.'),
 disabled:c('La integración con Hacienda está desactivada en Empresa › Integraciones.','The Hacienda integration is disabled in Company › Integrations.'),mode_changed:c('El modo de Hacienda cambió desde que se reservó este comprobante.','The Hacienda mode changed since this document was reserved.'),
 provider_refused:c('El proveedor elegido no está disponible en este servidor. Se sigue en modo de prueba.','The selected provider is not available on this server. Test mode continues.'),
 validation:c('Revise los datos antes de emitir.','Check the details before issuing.'),
};
const OPERATION:Record<EinvoiceResponse['operation'],Copy>={issue:c('Envío','Submission'),status:c('Consulta de estado','Status query'),receiver_message:c('Envío del mensaje','Message submission'),receiver_status:c('Consulta del mensaje','Message query')};
const OUTCOME:Record<EinvoiceResponse['outcome'],Copy>={received:c('recibido','received'),duplicate:c('ya recibido antes (sin duplicar)','already received (not duplicated)'),error:c('error','error'),timeout:c('sin respuesta a tiempo','timed out'),state:c('estado','state')};
const STATE:Record<string,Copy>={recibido:c('recibido','received'),procesando:c('en proceso','processing'),aceptado:c('aceptado','accepted'),rechazado:c('rechazado','rejected'),error:c('error de procesamiento','processing error')};
export function einvoiceResponseLabel(row:EinvoiceResponse):Copy{
 const op=OPERATION[row.operation],out=row.outcome==='state'?STATE[row.state??'']??c(row.state??'',row.state??''):OUTCOME[row.outcome];
 return c(op.es+': '+out.es,op.en+': '+out.en);
}
export const EINVOICE_SETTINGS_COPY={
 title:c('Facturación electrónica','Electronic invoicing'),
 statusTitle:c('Proveedor y modo','Provider and mode'),
 statusHelp:c('Los comprobantes se generan en formato 4.4 de Hacienda. Mientras el modo sea Prueba, nada se envía a Hacienda ni a un proveedor.','Documents are generated in Hacienda format 4.4. While the mode is Test, nothing is sent to Hacienda or to a provider.'),
 mode:c('Modo','Mode'),modeTest:c('Prueba','Test'),modeHelp:c('Solo lectura. El modo real se activa en el servidor cuando el dueño entregue sus credenciales y lo autorice.','Read only. The real mode is turned on in the server once the owner provides credentials and authorizes it.'),
 provider:c('Proveedor','Provider'),providerActive:c('En uso','In use'),providerNeeds:c('Requiere credenciales en el servidor','Needs credentials on the server'),providerContract:c('Requiere contrato y credenciales','Needs a contract and credentials'),
 branch:c('Sucursal','Branch'),terminal:c('Terminal','Terminal'),activity:c('Actividad económica','Economic activity'),
 sequence:c('El consecutivo se lleva por sucursal, terminal y tipo de comprobante, sin saltos.','The sequence number runs per branch, terminal and document type, without gaps.'),
 serverEnv:c('Configuración del servidor','Server configuration'),envReady:c('lista','ready'),envMissing:c('faltan variables:','missing variables:'),
 received:c('Comprobantes recibidos de proveedores','Documents received from suppliers'),
 receivedHelp:c('Acepte o rechace un comprobante electrónico que le emitió un proveedor (mensaje receptor). En modo de prueba la respuesta es simulada.','Accept or reject an electronic document a supplier issued to you (receiver message). In test mode the answer is simulated.'),
 clave:c('Clave del comprobante (50 dígitos)','Document key (50 digits)'),emisorIdType:c('Tipo de identificación del emisor','Issuer identification type'),emisorId:c('Identificación del emisor','Issuer identification'),
 emisorName:c('Nombre del emisor','Issuer name'),issuedOn:c('Fecha de emisión','Issue date'),total:c('Total del comprobante (colones)','Document total (colones)'),tax:c('IVA del comprobante (colones)','Document VAT (colones)'),
 answer:c('Respuesta','Answer'),accept:c('Aceptar','Accept'),partial:c('Aceptar parcialmente','Accept partially'),reject:c('Rechazar','Reject'),detail:c('Motivo (5 a 160 caracteres)','Reason (5–160 characters)'),
 creditTax:c('IVA a acreditar (colones)','VAT to credit (colones)'),send:c('Enviar respuesta','Send answer'),sent:c('Respuesta registrada. Consulte su estado.','Answer recorded. Check its status.'),
 none:c('Todavía no ha respondido comprobantes recibidos.','You have not answered any received documents yet.'),check:c('Consultar estado','Check status'),
 needsSettings:c('Guarde primero los datos del emisor.','Save the issuer details first.'),
} as const;
