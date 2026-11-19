// Pure boundary/encoding tests: no browser, network, fixture accounts or database.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {decodeDeliveryPhotoBase64,DELIVERY_PHOTO_MAX_BYTES} from '../../src/lib/pro/delivery-photo-base64.ts';
for(const size of [1,2,3,4,5,31,1024,65537,DELIVERY_PHOTO_MAX_BYTES-2,DELIVERY_PHOTO_MAX_BYTES-1,DELIVERY_PHOTO_MAX_BYTES]){
 const bytes=randomBytes(size),encoded=bytes.toString('base64');assert.deepEqual(decodeDeliveryPhotoBase64(encoded),bytes);
}
for(const value of ['',null,0,'A','AAA','AAAAA','A===','====','QQ===','QQ==AAAA','QQ==\n','QQ== ','QQ=\u0000','QQ--','QQ__','YR==','YWF=','YQ=Q','YQ======','YQ==ignored'])assert.throws(()=>decodeDeliveryPhotoBase64(value));
assert.equal(decodeDeliveryPhotoBase64('YQ==').toString(),'a');assert.equal(decodeDeliveryPhotoBase64('YWE=').toString(),'aa');assert.throws(()=>decodeDeliveryPhotoBase64(Buffer.alloc(DELIVERY_PHOTO_MAX_BYTES+1).toString('base64')));
// Match the real WebKit/API fixture, retaining the exact 20 MiB assertion (Round 7C shared limit) and Sharp pipeline.
const source=await sharp({create:{width:24,height:24,channels:3,background:'#00a3d7'}}).png().toBuffer(),boundary=Buffer.concat([source,Buffer.alloc(DELIVERY_PHOTO_MAX_BYTES-source.length)]),decoded=decodeDeliveryPhotoBase64(boundary.toString('base64'));
assert.equal(decoded.length,20971520);assert.deepEqual(decoded,boundary);const image=sharp(decoded,{limitInputPixels:24000000,animated:false}),meta=await image.metadata();assert.equal(meta.format,'png');const jpeg=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer();assert.ok(jpeg.length>0&&jpeg.length<=2097152);
console.log('PASS bounded linear canonical base64: alphabet/padding/trailing/bits rejected, exact 20 MiB and padding boundaries accepted, 20 MiB+1 rejected, real padded PNG transcodes successfully.');
