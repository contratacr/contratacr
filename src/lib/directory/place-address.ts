/**
 * Address parts of a place joined once each (owner 2026-11-27: «San José, San José» never): street, locality, district,
 * canton, province; a part repeated with another case or accents is dropped.
 */
const fold=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase();
export function joinPlaceParts(parts:(string|null|undefined)[]):string{
 const seen=new Set<string>(),out:string[]=[];
 for(const p of parts){const v=p?.trim();if(!v)continue;const k=fold(v);if(seen.has(k))continue;seen.add(k);out.push(v);}
 return out.join(', ');
}
