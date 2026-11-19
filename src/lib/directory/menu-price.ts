// LOCAL PRO ONLY (multivertical P2). Exact mirror of pro_menu_price / pro_menu_rdiv in pro-menu-local.sql
// (scripts/pro/verify-pro-menu-db.mjs compares both). Integers only (céntimos); no dependencies, safe in the browser.
//
// The public menu always shows the FINAL price the customer pays: base + IVA (13 %) + service (10 %, only when the
// place charges it). The business says whether the price it typed already includes IVA and/or service.
// Assumption to confirm with the accountant/lawyer: service is computed on the base (before IVA) and is not part of
// the IVA base.

export const MENU_IVA_BPS=1300,MENU_SERVICE_BPS=1000;
export type MenuPricing={pricesIncludeIva:boolean;pricesIncludeService:boolean;serviceCharge:boolean;ivaRateBps:number;serviceRateBps:number};
export type MenuPriceBreakdown={base:number;iva:number;service:number;total:number};

/** round(a*b/c) half up, as (2ab+c) div 2c in SQL. a,b ≥ 0, c > 0. */
export const menuRoundDiv=(a:number,b:number,c:number)=>Math.floor((2*a*b+c)/(2*c));

export function menuPriceBreakdown(priceMinor:number,pricing:Pick<MenuPricing,'pricesIncludeIva'|'pricesIncludeService'|'ivaRateBps'>&{serviceRateBps:number}):MenuPriceBreakdown{
 if(!Number.isSafeInteger(priceMinor)||priceMinor<0)throw new RangeError('priceMinor');
 const P=priceMinor,i=Math.max(pricing.ivaRateBps|0,0),s=Math.max(pricing.serviceRateBps|0,0);
 const incIva=pricing.pricesIncludeIva,incSvc=s>0&&pricing.pricesIncludeService;
 if(incIva&&incSvc){const base=menuRoundDiv(P,10000,10000+i+s),service=menuRoundDiv(base,s,10000);return {base,iva:P-base-service,service,total:P};}
 if(incIva){const base=menuRoundDiv(P,10000,10000+i),service=menuRoundDiv(base,s,10000);return {base,iva:P-base,service,total:P+service};}
 if(incSvc){const base=menuRoundDiv(P,10000,10000+s),iva=menuRoundDiv(base,i,10000);return {base,iva,service:P-base,total:P+iva};}
 const iva=menuRoundDiv(P,i,10000),service=menuRoundDiv(P,s,10000);return {base:P,iva,service,total:P+iva+service};
}
/** Effective service rate of a place: 0 when it does not charge service. */
export const menuServiceBps=(p:Pick<MenuPricing,'serviceCharge'|'serviceRateBps'>)=>p.serviceCharge?p.serviceRateBps:0;

const SEPARATORS={es:{group:'.',dec:','},en:{group:',',dec:'.'}} as const;
/** Money in minor units → «₡4 500» (no decimals when whole) / «$12.50». */
// Formatted by hand (not Intl): Node and Safari use different es-CR group separators («₡5.000» vs «₡5 000»),
// which broke hydration. Output is identical on server and every browser.
export function formatMenuMoney(minor:number,currency:string,locale:'es'|'en'){
 const neg=minor<0,abs=Math.abs(Math.round(minor)),whole=Math.floor(abs/100),cents=abs%100;
 const {group,dec}=SEPARATORS[locale];
 const body=String(whole).replace(/\B(?=(\d{3})+(?!\d))/g,group)+(cents?dec+String(cents).padStart(2,'0'):'');
 const symbol=currency==='CRC'?'₡':currency==='USD'?'$':currency+' ';
 return (neg?'-':'')+symbol+body;
}
/** Major units typed by a person («4500», «4 500», «4.500,50», «12.5») → minor units, or null. */
export function parseMenuMoney(value:string):number|null{
 let v=value.replace(/[₡$\s ]/g,'').replace(/^CRC|^USD/i,'');
 if(!v)return null;
 if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(v))v=v.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(v))v=v.replace(/,/g,'');
 else v=v.replace(',','.');
 if(!/^\d{1,8}(\.\d{1,2})?$/.test(v))return null;
 const [int,dec='']=v.split('.');return Number(int)*100+Number((dec+'00').slice(0,2));
}
