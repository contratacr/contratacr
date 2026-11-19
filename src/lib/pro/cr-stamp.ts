/** Round 7B: server stamps already in Costa Rica wall time («YYYY-MM-DD HH:MM[:SS]»)
 * read the same as every other date on screen («13 nov 2026, 5:58 p. m.»). The
 * value is formatted as written (no time-zone shift); anything else is kept. */
export function crWallStamp(value:string,en:boolean){
 const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
 if(!m)return value;
 const date=new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]??0)));
 if(Number.isNaN(date.getTime()))return value;
 return new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(date);
}
