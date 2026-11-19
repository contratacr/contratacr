import 'server-only';
import {claimMockOutbox,EmailClaimCodeSender,MockClaimCodeSender,mockEmailTransport,type ClaimCodeChannel,type ClaimCodeSender,type ClaimEmailTransport} from './claim-otp';
import {resolveEmailMode} from '@/lib/email/provider';
import {sendLaunchEmail} from './launch-email';

// LOCAL PRO ONLY (claim by e-mail, 2026-11-17): picks the sender of a claim code on the server.
//  * e-mail, default «mock»: EmailClaimCodeSender → in-memory outbox (read by the local test mailbox route and E2E).
//  * e-mail «sandbox» (only when DIR_CLAIM_EMAIL_MODE=sandbox, outside production, and the app's Brevo key exists):
//    the SAME e-mail goes through the app's single send path (src/lib/email/send.ts → outbox.ts → Brevo) with Brevo's
//    sandbox header (X-Sib-Sandbox: drop): the provider validates the request and delivers nothing.
//  * Any other value (including «production») stays on the mock: this build never delivers a claim code for real.
//  * SMS: mock only (no SMS/voice provider), and phone_listed is OFF unless DIR_CLAIM_SMS_ENABLED (feature-flags.ts).
//  * 2026-11-18: when the provider adapter (src/lib/email/provider.ts, EMAIL_PROVIDER/EMAIL_MODE) resolves to
//    «sandbox» or «live», the code goes through it instead (Resend; sandbox = Resend test inbox only; live only in
//    production with EMAIL_MODE=live). Guide: docs/directorio/correo.md.
export type ClaimEmailMode='mock'|'sandbox'|'live';
export function claimEmailMode():ClaimEmailMode{
 const adapter=resolveEmailMode();if(adapter!=='mock')return adapter;
 return process.env.DIR_CLAIM_EMAIL_MODE==='sandbox'&&process.env.NODE_ENV!=='production'&&!!process.env.BREVO_API_KEY?'sandbox':'mock';
}
const sandboxTransport:ClaimEmailTransport=async mail=>{
 const {sendBrevoEmail,brandedEmailDocument}=await import('@/lib/email/send');
 const r=await sendBrevoEmail({to:mail.to,subject:mail.subject,html:brandedEmailDocument({title:mail.subject,bodyHtml:mail.bodyHtml}),
  eventKey:mail.eventKey,purpose:'security',nivel:'critico',sandbox:true});
 return {accepted:r.ok||r.status==='queued',providerRef:r.status};
};
const providerTransport:ClaimEmailTransport=async mail=>{
 const r=await sendLaunchEmail({kind:'claim_code',locale:mail.locale,to:mail.to,eventId:mail.eventKey.replace(/^dir-claim-code:/,''),data:{code:mail.code}});
 return {accepted:r.ok,providerRef:r.status};
};
export function claimCodeSenderFor(channel:ClaimCodeChannel):ClaimCodeSender{
 if(channel==='sms')return new MockClaimCodeSender(claimMockOutbox());
 if(resolveEmailMode()!=='mock')return new EmailClaimCodeSender(providerTransport,`email-${resolveEmailMode()}`);
 return claimEmailMode()==='sandbox'?new EmailClaimCodeSender(sandboxTransport,'email-sandbox'):new EmailClaimCodeSender(mockEmailTransport(claimMockOutbox()),'email-mock');
}
