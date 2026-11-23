/**
 * Row 65: minimal ZIP reader (no dependency) for USDZ files. A USDZ is a ZIP whose entries are stored uncompressed, but this also
 * accepts deflate when the caller injects an inflater (node:zlib inflateRawSync on the server). Bounded: entry count, sizes, no zip64.
 */
export type ZipEntry={name:string;method:number;compressedSize:number;size:number;offset:number};
export const ZIP_MAX_ENTRIES=500,ZIP_MAX_ENTRY_BYTES=20*1024*1024;
const u16=(b:Uint8Array,o:number)=>b[o]!|b[o+1]!<<8,u32=(b:Uint8Array,o:number)=>(b[o]!|b[o+1]!<<8|b[o+2]!<<16|b[o+3]!<<24)>>>0;
export function readZipEntries(bytes:Uint8Array):ZipEntry[]|null{
 if(bytes.length<22||u32(bytes,0)!==0x04034b50)return null;
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-22-65535);i--){if(u32(bytes,i)===0x06054b50){eocd=i;break;}}
 if(eocd<0)return null;
 const count=u16(bytes,eocd+10);let pos=u32(bytes,eocd+16);
 if(count>ZIP_MAX_ENTRIES)return null;
 const entries:ZipEntry[]=[],decoder=new TextDecoder();
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||u32(bytes,pos)!==0x02014b50)return null;
  const method=u16(bytes,pos+10),compressedSize=u32(bytes,pos+20),size=u32(bytes,pos+24),nameLen=u16(bytes,pos+28),extraLen=u16(bytes,pos+30),commentLen=u16(bytes,pos+32),offset=u32(bytes,pos+42);
  if(pos+46+nameLen>bytes.length)return null;
  entries.push({name:decoder.decode(bytes.subarray(pos+46,pos+46+nameLen)),method,compressedSize,size,offset});
  pos+=46+nameLen+extraLen+commentLen;
 }
 return entries;
}
export function readZipEntry(bytes:Uint8Array,entry:ZipEntry,inflate?:(data:Uint8Array)=>Uint8Array):Uint8Array|null{
 const o=entry.offset;if(o+30>bytes.length||u32(bytes,o)!==0x04034b50)return null;
 if(entry.size>ZIP_MAX_ENTRY_BYTES||entry.compressedSize>ZIP_MAX_ENTRY_BYTES)return null;
 const start=o+30+u16(bytes,o+26)+u16(bytes,o+28),data=bytes.subarray(start,start+entry.compressedSize);
 if(data.length!==entry.compressedSize)return null;
 if(entry.method===0)return data;
 if(entry.method===8&&inflate){try{const out=inflate(data);return out.length<=ZIP_MAX_ENTRY_BYTES?out:null;}catch{return null;}}
 return null;
}
