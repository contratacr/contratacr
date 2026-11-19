/** Display only: Costa Rican numbers (8 digits, optionally with 506) as «+506 8888-7777»; anything else is returned untouched. */
export function proPhone(value:string|null|undefined){
 const raw=(value??'').trim();if(!raw)return '';
 const digits=raw.replace(/[\s().-]/g,'').replace(/^\+/,'').replace(/^00/,'');
 if(!/^\d+$/.test(digits))return raw;
 const local=digits.length===11&&digits.startsWith('506')?digits.slice(3):digits.length===8?digits:'';
 return local?`+506 ${local.slice(0,4)}-${local.slice(4)}`:raw;
}
