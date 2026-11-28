import {placeSocialUrl} from './place-social';

/**
 * «Ver menú» fallback (owner 2026-11-27): while ContrataCR has NO menu for a place (no typed menu, no approved menu
 * photos), the «Menú» tab links out to where the business keeps it. Link only (never embedded or copied), opened in a
 * new tab with rel="noopener noreferrer nofollow". Source priority, first that exists:
 *  1. an explicit menu URL (attributes.menuUrl, from the OSM tags website:menu / menu:url / contact:menu / menu —
 *     scripts/directory/backfill-menu-links.mjs),
 *  2. the business website, 3. Instagram, 4. Facebook (attributes.social),
 *  5. a Google Maps search link by name and area (just a link to their page; nothing is fetched or copied).
 * Sections: food places (restaurants, sodas, cafés, bars, bakeries, ice-cream shops, delis) get the whole chain («Ver
 * menú»). Other sections (beauty, workshops, car washes…) get «Ver precios» ONLY with an explicit price-list URL (1):
 * a homepage or a social profile is not a price list.
 */
export type MenuLinkSource='menu'|'website'|'instagram'|'facebook'|'maps';
export type MenuLink={url:string;source:MenuLinkSource;kind:'menu'|'prices'};
/** food_shop kinds that serve from a menu (bakeries, ice-cream shops, coffee shops, delis). */
const MENU_SHOP_KINDS=['bakery','ice_cream','coffee_shop','deli'];
/** Section whose photos/menu behave like a restaurant's: restaurant and cafe_bar, plus the menu kinds of food_shop. */
export function menuSectionOf(vertical:string,kind:unknown):'restaurant'|'cafe_bar'|null{
 if(vertical==='restaurant'||vertical==='cafe_bar')return vertical;
 if(vertical==='food_shop'&&typeof kind==='string'&&MENU_SHOP_KINDS.includes(kind))return 'cafe_bar';
 return null;
}
/** https URL of at most 300 characters, no credentials; http is upgraded only for the menu/website fields. */
export function cleanExternalUrl(raw:unknown):string|null{
 if(typeof raw!=='string')return null;
 let v=raw.trim();if(v.includes(';'))v=v.split(';')[0]!.trim();
 if(!v||v.length>300||/\s/.test(v))return null;
 if(!/^https?:\/\//i.test(v)){if(/^\w+:/.test(v))return null;v='https://'+v;}
 let u:URL;try{u=new URL(v);}catch{return null;}
 if(u.username||u.password||!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname))return null;
 return u.toString();
}
export function mapsSearchUrl(name:string,area:string|null):string{
 return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name,area,'Costa Rica'].filter(Boolean).join(', '))}`;
}
export function placeMenuLink(p:{vertical:string;kind:unknown;name:string;area:string|null;website:string|null;attributes:Record<string,unknown>}):MenuLink|null{
 const explicit=cleanExternalUrl(p.attributes.menuUrl);
 if(!menuSectionOf(p.vertical,p.kind))return explicit?{url:explicit,source:'menu',kind:'prices'}:null;
 if(explicit)return {url:explicit,source:'menu',kind:'menu'};
 const site=cleanExternalUrl(p.website);if(site)return {url:site,source:'website',kind:'menu'};
 const social=(p.attributes.social&&typeof p.attributes.social==='object'?p.attributes.social:{}) as Record<string,unknown>;
 const ig=placeSocialUrl('instagram',social.instagram);if(ig)return {url:ig,source:'instagram',kind:'menu'};
 const fb=placeSocialUrl('facebook',social.facebook);if(fb)return {url:fb,source:'facebook',kind:'menu'};
 return {url:mapsSearchUrl(p.name,p.area),source:'maps',kind:'menu'};
}
/** «Ver menú en su sitio web | Instagram | Facebook | Google Maps» (or «Ver precios…»). */
export function menuLinkLabel(l:MenuLink,en:boolean):string{
 const what=l.kind==='prices'?(en?'See prices':'Ver precios'):(en?'See the menu':'Ver menú');
 const where={menu:en?'on their website':'en su sitio web',website:en?'on their website':'en su sitio web',instagram:'en Instagram',facebook:'en Facebook',maps:'en Google Maps'}[l.source];
 return `${what} ${l.source==='instagram'||l.source==='facebook'||l.source==='maps'?(en?where.replace(/^en /,'on '):where):where}`;
}
