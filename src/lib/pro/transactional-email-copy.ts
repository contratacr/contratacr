// LOCAL PRO ONLY (launch fix I5). Client-safe copy for the e-mail outcome a Pro route reports after an action
// (see src/lib/pro/transactional-email.ts). Honest wording: «sent» only when the e-mail was really queued
// (Brevo sandbox here); in the default mock mode the UI says e-mail is not configured and offers «Copy link».
export type TransactionalEmailView={mode:'mock'|'sandbox';status:'recorded'|'queued'|'no_recipient'|'failed';to:string|null};

export function parseTransactionalEmailView(value:unknown):TransactionalEmailView|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(v.mode!=='mock'&&v.mode!=='sandbox')return null;
 if(!['recorded','queued','no_recipient','failed'].includes(String(v.status)))return null;
 return {mode:v.mode,status:v.status as TransactionalEmailView['status'],to:typeof v.to==='string'&&v.to.length<=254?v.to:null};
}
/** «mock:recorded» style header value → view (no address travels in a header). */
export function parseTransactionalEmailHeader(value:string|null):TransactionalEmailView|null{
 const [mode,status]=String(value??'').split(':');
 return parseTransactionalEmailView({mode,status,to:null});
}

/** `person`: who receives it («su cliente», «la persona»). */
/** `handoff`: what the professional can send by hand when nothing was delivered (a link, or the invoice PDF). */
export function transactionalEmailNotice(view:TransactionalEmailView|null,en:boolean,person:'customer'|'member'='customer',handoff:'link'|'pdf'='link'):string|null{
 if(!view)return null;
 const who=en?(person==='customer'?'your customer':'the person'):(person==='customer'?'su cliente':'la persona');
 if(handoff==='pdf'&&view.status!=='queued'){
  if(view.status==='recorded')return en
   ?`E-mail sending is not configured in this version: no e-mail was delivered${view.to?' to '+view.to:''}. Use «Print or PDF» and send it to ${who} yourself.`
   :`El envío de correos no está configurado en esta versión: no se entregó ningún correo${view.to?' a '+view.to:''}. Use «Imprimir o PDF» y envíeselo usted a ${who}.`;
  if(view.status==='no_recipient')return en
   ?`The invoice has no recipient e-mail: no e-mail was sent. Use «Print or PDF» and send it yourself.`
   :`La factura no tiene correo del receptor: no se envió ningún correo. Use «Imprimir o PDF» y envíesela usted.`;
  return en?'The e-mail could not be prepared: use «Print or PDF» and send it yourself.':'No se pudo preparar el correo: use «Imprimir o PDF» y envíesela usted.';
 }
 if(view.status==='queued')return view.to?(en?`An e-mail was sent to ${view.to}.`:`Se envió un correo a ${view.to}.`):(en?`An e-mail was sent to ${who}.`:`Se envió un correo a ${who}.`);
 if(view.status==='recorded')return en
  ?`E-mail sending is not configured in this version: no e-mail was delivered${view.to?' to '+view.to:''}. Copy the link and send it to ${who} yourself.`
  :`El envío de correos no está configurado en esta versión: no se entregó ningún correo${view.to?' a '+view.to:''}. Copie el enlace y envíeselo usted a ${who}.`;
 if(view.status==='no_recipient')return en
  ?`There is no e-mail on file for ${who}: copy the link and send it yourself.`
  :`No hay un correo registrado para ${who}: copie el enlace y envíeselo usted.`;
 return en?'The e-mail could not be prepared: copy the link and send it yourself.':'No se pudo preparar el correo: copie el enlace y envíeselo usted.';
}
