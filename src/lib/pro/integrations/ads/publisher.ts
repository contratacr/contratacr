import {createHash} from 'node:crypto';

/**
 * Pro 29 (row 70): ad publishing adapter. The ONLY active implementation is the mock: it returns a fictitious platform
 * reference and never calls Meta or Google, never spends money. The real ones (Marketing API / Google Ads API campaign
 * creation) are documented and refuse to run: they need an approved app, an ad account and Isaac's OK, plus the production
 * flag, exactly like the other adapters (resolveMode in integrations/server.ts).
 */
export type AdPublishInput={id:string;platform:'meta'|'google';name:string;dailyBudgetCents:number;totalBudgetCents:number;startOn:string;endOn:string};
export interface AdPublisher{readonly provider:'meta_ads'|'google_ads';readonly mode:'mock'|'sandbox'|'production';publish(input:AdPublishInput):Promise<{platformRef:string}>}
export class MockAdPublisher implements AdPublisher{
 readonly mode='mock' as const;
 constructor(readonly provider:'meta_ads'|'google_ads'){}
 async publish(input:AdPublishInput){return {platformRef:`sbx_${input.platform}_${createHash('sha256').update('sandbox:'+input.id).digest('hex').slice(0,16)}`};}
}
export class NotActiveAdPublisher implements AdPublisher{
 constructor(readonly provider:'meta_ads'|'google_ads',readonly mode:'sandbox'|'production'){}
 async publish():Promise<{platformRef:string}>{throw Error(`${this.provider} publishing is not active (documented adapter).`);}
}
export function adPublisherFor(platform:'meta'|'google',mode:'mock'|'sandbox'|'production'):AdPublisher{
 const provider=platform==='meta'?'meta_ads':'google_ads';
 return mode==='mock'?new MockAdPublisher(provider):new NotActiveAdPublisher(provider,mode);
}
