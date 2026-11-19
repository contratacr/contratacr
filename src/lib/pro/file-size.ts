/** Round 7B: one file-size format everywhere (B under 1 KB, KB with one decimal under 10 KB, MB from 1 MB). */
export function proFileSize(bytes:number,en=false){
 const n=new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:1});
 if(!Number.isFinite(bytes)||bytes<0)return '';
 if(bytes<1024)return bytes+' B';
 if(bytes<1024*1024){const kb=bytes/1024;return (kb<10?n.format(Math.round(kb*10)/10):String(Math.round(kb)))+' KB';}
 return n.format(Math.round(bytes/104857.6)/10)+' MB';
}
