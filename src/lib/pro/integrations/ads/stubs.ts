/**
 * Round 6D (row 70): DOCUMENTED STUBS of the ad-platform cost importers. Not active and never called: the cost
 * per lead report works today with costs typed by the owner. When Isaac approves an activation, each adapter
 * reads ONLY the daily spend of the campaigns the owner links (no audience, no personal data) and writes it as
 * cost entries tagged with the platform, through the same append-only writer (pro_ad_mutate cost_add).
 *  · Meta Marketing API: GET /v{version}/act_{ad_account_id}/insights?fields=campaign_name,spend&time_increment=1
 *    (OAuth user token with ads_read; token stored only as an AES-GCM envelope like Round 6B).
 *  · Google Ads API: GoogleAdsService.SearchStream with
 *    «SELECT campaign.name, segments.date, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS»
 *    (developer token + OAuth refresh token; cost_micros / 10 000 = cents of the account currency).
 */
export type DailySpend={platformCampaign:string;date:string;amountCents:number;currency:string};
export interface AdCostImporter{readonly provider:'meta_ads'|'google_ads';dailySpend(from:string,to:string):Promise<DailySpend[]>}
export class NotActiveAdImporter implements AdCostImporter{
 constructor(readonly provider:'meta_ads'|'google_ads'){}
 async dailySpend():Promise<DailySpend[]>{throw Error(`${this.provider} cost import is not active (documented stub).`);}
}
/** Google Ads reports micros of the account currency. */
export const microsToCents=(micros:number)=>Math.round(micros/10000);
