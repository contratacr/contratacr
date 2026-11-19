/** Coordinate-only searches come from Near me. Explicit user ordering wins. */
export function resolveSearchSort(params:{sortBy?:string;lat?:string;lng?:string;provincia?:string;canton?:string}):'rating'|'cercania'|'experience'{
 const coordinates=!!params.lat&&!!params.lng&&Number.isFinite(Number(params.lat))&&Number.isFinite(Number(params.lng));
 if(params.sortBy==='cercania')return coordinates?'cercania':'rating';
 if(params.sortBy==='rating'||params.sortBy==='experience')return params.sortBy;
 const administrative=(!!params.provincia&&params.provincia!=='todas')|| (!!params.canton&&params.canton!=='todos');
 return coordinates&&!administrative?'cercania':'rating';
}
