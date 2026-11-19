/** Count + noun with proper singular/plural in both languages: proCount(3, en, ['día','días'], ['day','days']) -> "3 días". */
export function proCount(n:number,en:boolean,es:readonly [string,string],english:readonly [string,string]){
 const pair=en?english:es;return `${n} ${n===1?pair[0]:pair[1]}`;
}
