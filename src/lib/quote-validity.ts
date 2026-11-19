/** Calendar expiration used when preparing a new quote in Costa Rica. */
export function quoteValidUntil(validDays:number,now=Date.now()):string{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now+validDays*86_400_000));
 const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)!.value;
 return `${value('year')}-${value('month')}-${value('day')}`;
}
