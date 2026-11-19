import {Buffer} from 'node:buffer';
// Round 7C: same value as PRO_FILE_MAX_BYTES (file-limit.ts), inlined: this file is loaded standalone by verify-delivery-photo-base64.mjs.
export const DELIVERY_PHOTO_MAX_BYTES=20*1024*1024;
function sextet(code:number){
 if(code>=65&&code<=90)return code-65;
 if(code>=97&&code<=122)return code-71;
 if(code>=48&&code<=57)return code+4;
 if(code===43)return 62;if(code===47)return 63;return -1;
}
/** Linear, bounded validation. A quantified multi-megabyte regex can overflow V8's stack. */
export function decodeDeliveryPhotoBase64(value:string):Buffer{
 if(typeof value!=='string'||!value.length||value.length>4*Math.ceil(DELIVERY_PHOTO_MAX_BYTES/3)||value.length%4!==0)throw Error('Invalid photo base64 length');
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,contentLength=value.length-padding,decodedLength=value.length/4*3-padding;
 if(decodedLength<1||decodedLength>DELIVERY_PHOTO_MAX_BYTES)throw Error('Photo exceeds maximum size');
 let last=0;
 for(let i=0;i<contentLength;i++){last=sextet(value.charCodeAt(i));if(last<0)throw Error('Invalid photo base64 alphabet');}
 // Unused padding bits must be zero; reject alternative encodings of the same bytes.
 if(padding===1&&(last&3)!==0||padding===2&&(last&15)!==0)throw Error('Noncanonical photo base64');
 const bytes=Buffer.from(value,'base64');if(bytes.length!==decodedLength)throw Error('Invalid photo base64 payload');return bytes;
}
