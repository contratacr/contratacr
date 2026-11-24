'use client';
/** Recently viewed places and dismissed "Comparta su experiencia" cards, kept in this browser only (try/catch everywhere). */
export type ViewedPlace={slug:string;name:string;area?:string;image?:string;at:number};
const KEY='ccr:dir:recent:v1',DISMISS='ccr:dir:experience-dismissed:v1',ANSWERS='ccr:dir:experience-answers:v1';
const read=<T,>(key:string,fallback:T):T=>{try{const raw=window.localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback;}catch{return fallback;}};
const write=(key:string,value:unknown)=>{try{window.localStorage.setItem(key,JSON.stringify(value));}catch{/* blocked */}};
export function readViewedPlaces():ViewedPlace[]{
 const v=read<unknown>(KEY,[]);
 return Array.isArray(v)?v.filter((x):x is ViewedPlace=>!!x&&typeof (x as ViewedPlace).slug==='string'&&typeof (x as ViewedPlace).name==='string').slice(0,12):[];
}
export function rememberViewedPlace(p:Omit<ViewedPlace,'at'>){
 if(!p.slug||!p.name)return;
 write(KEY,[{...p,at:Date.now()},...readViewedPlaces().filter(x=>x.slug!==p.slug)].slice(0,12));
}
export const readDismissed=():string[]=>{const v=read<unknown>(DISMISS,[]);return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];};
export function dismissExperience(slug:string){write(DISMISS,[...new Set([...readDismissed(),slug])].slice(-60));}
export function answerExperience(slug:string,answer:'yes'|'no'|'maybe'){
 write(ANSWERS,{...read<Record<string,string>>(ANSWERS,{}),[slug]:answer});dismissExperience(slug);
}
