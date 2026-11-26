import {stripImageMetadata} from '../media/strip-image-metadata';
import type {PhotoVariantSize} from './photo-pipeline';

/**
 * The browser-made variants of a directory photo upload (storage plan 2026-11-26): form fields file (1600) / v800 / v320,
 * or null when the browser sent the file alone. Each one goes through the same lossless metadata stripping as the other
 * uploads (WebKit writes EXIF and IPTC blocks into canvas JPEGs). A variant that cannot be stripped, or that still
 * carries a rotation, is passed on unchanged so processListingPhoto refuses it ('metadata' / 'codec').
 * Then createClientVariantsCodec + processListingPhoto validate them like server-made variants.
 */
export async function clientVariantsOf(form:FormData,main:Uint8Array):Promise<Record<PhotoVariantSize,Uint8Array>|null>{
 const v800=form.get('v800'),v320=form.get('v320');
 if(!(v800 instanceof Blob)||!(v320 instanceof Blob))return null;
 const clean=(b:Uint8Array)=>{const s=stripImageMetadata(b);return s.ok&&(s.orientation===null||s.orientation===1)?s.bytes:b;};
 return{1600:clean(main),800:clean(new Uint8Array(await v800.arrayBuffer())),320:clean(new Uint8Array(await v320.arrayBuffer()))};
}
