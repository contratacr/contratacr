// Launch guard (2026-11-18): what a claim-code answer may echo for LOCAL testing. Pure, browser-safe, unit-tested
// (scripts/directory/claim-local-echo.test.mjs). In a production build (NODE_ENV=production, which includes the
// Cloudflare Workers build) it is ALWAYS empty: no SMS mock code (`devCode`) and no test-mailbox link (`testMailbox`)
// can ever reach a browser, whatever the channel, the e-mail mode or other flags say.
export type ClaimLocalEcho={devCode?:string;testMailbox?:string};
export function claimLocalEcho(input:{nodeEnv:string|undefined;channel:'sms'|'email';emailMode:string|'live';claimId:string;code:string}):ClaimLocalEcho{
 if(input.nodeEnv==='production')return {};
 if(input.channel==='sms')return {devCode:input.code};
 return input.emailMode==='mock'?{testMailbox:`/api/reclamos/${input.claimId}/buzon-prueba`}:{};
}
