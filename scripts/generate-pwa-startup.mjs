import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
// Keep generation tied to the exact device matrix used by metadata.
const source = await readFile(new URL("../src/lib/pwa-startup.ts", import.meta.url), "utf8");
const devices = [...source.matchAll(/\[(\d+),(\d+),(\d+)\]/g)].map(match => match.slice(1).map(Number));
if (!devices.length) throw new Error("No PWA startup dimensions found");
const directory = new URL("../public/pwa/startup/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [width,height,scale] of devices) {
  const mark = await sharp(new URL("../public/logo-mark-transparent.png", import.meta.url).pathname).resize(32*scale,32*scale).png().toBuffer();
  const word = await sharp(new URL("../public/brand/wordmark-light.svg", import.meta.url).pathname, { density:72*scale }).resize(105*scale,24*scale).png().toBuffer();
  for (const orientation of ["portrait","landscape"]) {
    const w=(orientation==="portrait"?width:height)*scale,h=(orientation==="portrait"?height:width)*scale;
    const x=Math.round((w-137*scale)/2),y=Math.round((h-32*scale)/2);
    await sharp({create:{width:w,height:h,channels:3,background:"#ffffff"}})
      .composite([{input:mark,left:x,top:y},{input:word,left:x+32*scale,top:y+4*scale}])
      .png().toFile(new URL(`${width}x${height}@${scale}-${orientation}.png`,directory).pathname);
  }
}
console.log(`Generated ${devices.length*2} white PWA launch images using the approved brand assets.`);
