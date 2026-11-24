/** Area C: client-side filters of the job files list (uploaded date range, file type). */
export type FileTypeFilter='all'|'image'|'pdf'|'other';
export type FileFilters={from:string;to:string;type:FileTypeFilter};
export const emptyFileFilters:FileFilters={from:'',to:'',type:'all'};
export function fileTypeOf(mimeType:string):Exclude<FileTypeFilter,'all'>{return mimeType.startsWith('image/')?'image':mimeType==='application/pdf'?'pdf':'other';}
/** Civil day (America/Costa_Rica) of an ISO instant. */
export function crDay(iso:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}
export function filterFiles<T extends {createdAt:string;mimeType:string}>(list:readonly T[],f:FileFilters){
 return list.filter(file=>{
  const day=crDay(file.createdAt);
  if(f.from&&day<f.from)return false;if(f.to&&day>f.to)return false;
  if(f.type!=='all'&&fileTypeOf(file.mimeType)!==f.type)return false;
  return true;
 });
}
export const fileFiltersActive=(f:FileFilters)=>!!(f.from||f.to||f.type!=='all');
