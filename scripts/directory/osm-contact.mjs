// LOCAL PRO ONLY (2026-11-27, owner: more WhatsApp / Llamar buttons on /negocios/<slug>): OSM contact tags → the place's
// phone («+506XXXXXXXX» when Costa Rican) and attributes.whatsapp. Only values the mapper really wrote: a WhatsApp number is
// taken from contact:whatsapp / whatsapp / phone:whatsapp (a number, a wa.me link) or from a mobile number whose own
// value says «WhatsApp», or from whatsapp=yes next to a Costa Rican MOBILE number. A landline is never turned into a
// WhatsApp. Several values separated by «;» keep the first. Never throws; invalid values give undefined.
const SEP=/\s*(?:[;,/|]|\s-\s|\sy\s|\so\s|\sor\s)\s*/i;
const CR_LOCAL=/^[245678]\d{7}$/,CR_SPECIAL=/^(800|900|905)\d{7}$/,CR_MOBILE=/^[5678]\d{7}$/;

/** Digits of a Costa Rican number without the country prefix, or null. */
function crDigits(raw){
 const digits=(raw.trim().startsWith('+')?'+':'')+raw.replace(/\D/g,'');
 const d=digits.replace(/^\+?(?:00|011|01|0)?506(?=\d{8,10}$)/,'');
 return CR_LOCAL.test(d)||CR_SPECIAL.test(d)?d:null;
}
/** One number → «+506XXXXXXXX» (Costa Rica; toll-free «800XXXXXXX» as is), or the cleaned «+CC…» of another country, or undefined. */
export function normalizePhone(raw,{foreign=true}={}){
 if(typeof raw!=='string')return undefined;
 for(const c of raw.split(SEP).map(s=>s.trim()).filter(Boolean)){
  const local=crDigits(c);if(local)return CR_SPECIAL.test(local)?local:`+506${local}`;
  const d=c.replace(/[^\d+]/g,'');
  if(foreign&&/^\+[1-9]\d{9,14}$/.test(d)&&!d.startsWith('+506'))return d;
  return undefined;// only the FIRST value is considered
 }
 return undefined;
}
const isCrMobile=n=>/^\+506[5678]\d{7}$/.test(n??'');
const numberIn=text=>{const m=String(text).match(/\+?\(?\d[\d\s().-]{6,20}\d/);return m?m[0]:null;};

const PHONE_KEYS=['phone','contact:phone','mobile','contact:mobile','phone:mobile'];
const MOBILE_KEYS=['mobile','contact:mobile','phone:mobile'];
const clip=v=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,120):'';

/** The business phone: phone / contact:phone first, then a mobile number. */
export function phoneFromTags(tags){
 for(const k of PHONE_KEYS){const n=normalizePhone(numberIn(clip(tags?.[k]))?clip(tags[k]):'');if(n)return n;}
 return undefined;
}

/** The WhatsApp number explicitly tagged in OSM, or undefined. */
export function whatsappFromTags(tags){
 const t=tags??{};
 for(const k of ['contact:whatsapp','whatsapp','phone:whatsapp']){
  const v=clip(t[k]);if(!v)continue;
  if(/^(yes|true|1)$/i.test(v)){
   // «whatsapp=yes»: the element's own mobile number (never a landline).
   for(const m of [...MOBILE_KEYS,'phone','contact:phone']){const n=normalizePhone(clip(t[m]));if(isCrMobile(n))return n;}
   continue;
  }
  if(/^(no|false|0)$/i.test(v))continue;
  const link=v.match(/wa\.me\/\+?(\d{8,15})/i)??v.match(/[?&]phone=\+?(\d{8,15})/i);
  const n=normalizePhone(link?`+${link[1]}`:v);if(n&&!/^800|^900|^905/.test(n))return n;
 }
 // A mobile/phone value that itself says it is WhatsApp («+506 8888 8888 WhatsApp»).
 for(const k of [...MOBILE_KEYS,'phone','contact:phone']){
  const v=clip(t[k]);if(!/whats\s?app/i.test(v))continue;
  const num=numberIn(v);const n=num?normalizePhone(num):undefined;if(n&&!/^800|^900|^905/.test(n))return n;
 }
 return undefined;
}
