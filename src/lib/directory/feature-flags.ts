// Owner decision 2026-11-16: the directory launches Yelp-style (places, reviews, claims, menus, prices). Vehicle and
// property CLASSIFIED LISTINGS stay in the code and SQL but are OFF: their public pages, the landings, the Pro
// inventory and their API routes answer 404, and no search, navigation or sitemap entry points to them. Dealers and
// real-estate agencies still appear as places. Turn on only with the explicit server variable
// DIRECTORY_LISTINGS_ENABLED=true (never NEXT_PUBLIC_: the decision is made on the server).
export const DIRECTORY_LISTINGS_ENABLED=process.env.DIRECTORY_LISTINGS_ENABLED==='true';
export const isListingSearchVertical=(v:string)=>v==='vehiculos'||v==='inmuebles';

// Owner decision 2026-11-17: claims are confirmed by E-MAIL (no per-message cost). The SMS/voice code to the phone on
// the place (phone_listed) stays in the code but is OFF: the claim block does not offer it and the claim routes answer
// 400 claim_sms_disabled. Turn on only with the explicit server variable DIR_CLAIM_SMS_ENABLED=true (never
// NEXT_PUBLIC_) AND dir_claim_settings.sms_enabled=true in the database (the SQL refuses phone_listed otherwise).
export const DIR_CLAIM_SMS_ENABLED=process.env.DIR_CLAIM_SMS_ENABLED==='true';

// Launch flag (owner, 2026-11-18): the HEALTH section («Salud»: clinics, practices, labs, opticians) can stay OFF at
// launch until the lawyer reviews it. Server variable DIR_HEALTH_ENABLED ('true' | 'false', never NEXT_PUBLIC_). Unset:
// ON in local development, OFF in any production build. When OFF: /salud and /en/salud answer 404, a health place page
// (/negocios/<slug>) answers 404 (noindex), the search/facets APIs refuse the section and drop health places from every
// other result list or facet (all-places search, assistant), so nothing in lists, search, sitemap or navigation points to
// it. Data and SQL stay untouched. Documented in docs/pro/required-env.md.
export const DIR_HEALTH_ENABLED=process.env.DIR_HEALTH_ENABLED==='true'||(process.env.DIR_HEALTH_ENABLED!=='false'&&process.env.NODE_ENV==='development');
export const isHealthSearchVertical=(v:string)=>v==='salud';
/** Drops health places from a result page while the section is off (item.vertical.id === 'health'). */
export function withoutDisabledVerticals<T>(items:T[]):T[]{
 return DIR_HEALTH_ENABLED?items:items.filter(item=>{const v=(item as {vertical?:unknown}).vertical;return !(v&&typeof v==='object'&&(v as {id?:unknown}).id==='health');});
}
/** Drops the health value from a facet list while the section is off. */
export function withoutDisabledFacetValues<T extends {value:string|number}>(values:T[]|undefined):T[]|undefined{
 return DIR_HEALTH_ENABLED||!values?values:values.filter(v=>v.value!=='health');
}

// Launch flag (2026-11-18): the whole public DIRECTORY (the 15 place sections, /negocios, /marca, /eventos, /precios, lists,
// table reservations, claims, reviews, Q&A, reports, the admin directory queue and their /api/* routes). Server variable
// DIR_ENABLED ('true' | 'false', never NEXT_PUBLIC_). Unset: ON in local development, OFF in any production build, so a
// production deploy shows the directory only with DIR_ENABLED=true. Section flags above (health, listings, SMS) still
// apply on top. Development-only pieces (the claim test mailbox, the SMS mock code echo, test harnesses) stay
// development-only regardless of this flag.
export const DIR_ENABLED=process.env.DIR_ENABLED==='true'||(process.env.DIR_ENABLED!=='false'&&process.env.NODE_ENV==='development');

// Indexing rule (recommended to the owner 2026-11-18). Server variable DIR_INDEX_IMPORTED ('true' | 'false'; unset = true).
// true: an IMPORTED (OpenStreetMap), still unclaimed place is indexable when it has at least one useful contact datum —
// a phone, opening hours or a website; without any of them it stays noindex (thin page). false: imported/unverified
// places are never indexed (the previous behaviour). Claimed or verified places are always indexable. Search, filter and
// price-comparison pages stay noindex regardless.
export const DIR_INDEX_IMPORTED=process.env.DIR_INDEX_IMPORTED!=='false';
/** Same rule for the page metadata and the sitemap. */
export function placeIndexable(p:{verificationLevel:string;claimed?:boolean;hasPhone:boolean;hasHours:boolean;hasWebsite:boolean}):boolean{
 if(p.claimed||!['imported','unverified'].includes(p.verificationLevel))return true;
 return DIR_INDEX_IMPORTED&&(p.hasPhone||p.hasHours||p.hasWebsite);
}
