import {expect,test} from 'playwright/test';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {floorPlanContentSchema,extrudedFaces} from '../../src/lib/pro/floor-plan';
import {clipNear,floorPlanObj,parseDimensionsText,walkBlocked,walkStart,walkStep,walkthroughFaces} from '../../src/lib/pro/floor-walk';
import {parseScanObj,parseScanUsda,parseScanUsdz} from '../../src/lib/pro/room-scan';
import {readZipEntries} from '../../src/lib/pro/zip-lite';

// Rows 63/64/65: custom objects, walkthrough projector with near-plane clipping, OBJ export, scan units/axis, real USDZ (usda) reading.
const room=floorPlanContentSchema.parse({walls:[{id:'a',a:[0,0],b:[4,0],thickness:0.15},{id:'b',a:[4,0],b:[4,3],thickness:0.15},{id:'c',a:[4,3],b:[0,3],thickness:0.15},{id:'d',a:[0,3],b:[0,0],thickness:0.15}],
 openings:[{id:'o1',wallId:'d',kind:'door',offset:1,width:0.9}],rooms:[{id:'r',name:'Sala',points:[[0,0],[4,0],[4,3],[0,3]]}],dimensions:[],wallHeight:2.4,
 objects:[{id:'x',kind:'custom',label:'Mesa de centro',h:0.45,color:'#8a6d3b',x:2,y:1.5,w:1.2,d:0.6,rotation:0}]});
function zip(name:string,data:Buffer,method=0){
 const body=method===8?deflateRawSync(data):data,n=Buffer.from(name),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(method,8);local.writeUInt32LE(body.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(method,10);central.writeUInt32LE(body.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(0,42);
 const eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);eocd.writeUInt32LE(46+n.length,12);eocd.writeUInt32LE(30+n.length+body.length,16);
 return new Uint8Array(Buffer.concat([local,n,body,central,n,eocd]));
}
test('Row 63: custom objects validate strictly and are extruded with their own height and colour',()=>{
 expect(room.objects![0]!.kind).toBe('custom');
 expect(floorPlanContentSchema.safeParse({...room,objects:[{id:'x',kind:'custom',x:1,y:1,w:1,d:1,rotation:0}]}).success).toBe(false);
 expect(floorPlanContentSchema.safeParse({...room,objects:[{id:'x',kind:'bed',h:1,x:1,y:1,w:1,d:1,rotation:0}]}).success).toBe(false);
 const faces=extrudedFaces(room,0.6,0.9,{w:600,h:400}).filter(f=>f.kind==='object');expect(faces).toHaveLength(5);expect(faces.every(f=>f.color==='#8a6d3b')).toBe(true);
 expect(parseDimensionsText('120 x 60 x 75 cm')).toEqual({w:1.2,d:0.6,h:0.75});expect(parseDimensionsText('2,0 × 0,9 m')).toEqual({w:2,d:0.9,h:null});expect(parseDimensionsText('sin medidas')).toBeNull();
});
test('Row 64: walkthrough projector clips at the near plane, walls block and doors let the walker through',()=>{
 const cam={...walkStart(room),x:3.9,y:1.5,heading:0};
 const faces=walkthroughFaces(room,cam,{w:600,h:400});expect(faces.length).toBeGreaterThan(5);
 expect(faces.every(f=>f.points.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])))).toBe(true);
 for(let i=1;i<faces.length;i++)expect(faces[i-1]!.depth).toBeGreaterThanOrEqual(faces[i]!.depth);
 expect(clipNear([[0,0,-1],[1,0,-1],[1,1,-1]])).toEqual([]);expect(clipNear([[0,0,-1],[1,0,1],[1,1,1]]).every(p=>p[2]>=0.08)).toBe(true);
 expect(walkBlocked(room,2,1.5)).toBe(false);expect(walkBlocked(room,0.1,2.5)).toBe(true);expect(walkBlocked(room,0.1,1.4)).toBe(false);
 const slide=walkStep(room,{...cam,x:2,y:0.4},0.35,-0.35);expect(slide.y).toBeGreaterThanOrEqual(0.4-0.35);expect(walkBlocked(room,slide.x,slide.y)).toBe(false);
});
test('Row 64: OBJ export has floor, walls and object boxes in metres',()=>{
 const obj=floorPlanObj({name:'Planta',unit:'ft',content:room});expect(obj).toContain('o floor_Sala');expect(obj).toContain('o Mesa_de_centro_1');
 expect(obj.match(/^v /gm)!.length).toBe(4+4*8+8);expect(obj).toContain('v 1.2192');
});
test('Row 65: OBJ units and up axis, dimensions read, USDZ with usda is read for real, usdc stays simulated',()=>{
 const cm=['v 0 0 0','v 500 0 0','v 500 0 400','v 0 0 400','v 0 260 0','v 500 260 400'].join('\n');
 const a=parseScanObj(cm,false,{unit:'cm',upAxis:'y'});expect(a.ok&&a.measures).toMatchObject({width:5,depth:4,height:2.6,footprintArea:20});
 const wrong=parseScanObj(cm,false,{unit:'m',upAxis:'y'});expect(wrong.ok).toBe(false);
 const z=parseScanObj(['v 0 0 0','v 5 0 0','v 5 4 0','v 0 4 0','v 0 0 2.6','v 5 4 2.6'].join('\n'),false,{unit:'m',upAxis:'z'});expect(z.ok&&z.measures).toMatchObject({width:5,depth:4,height:2.6});
 const usda='#usda 1.0\n(\n metersPerUnit = 1\n upAxis = "Y"\n)\ndef Mesh "m"{\n point3f[] points = [(0, 0, 0), (5, 0, 0), (5, 0, 4), (0, 0, 4), (0, 2.5, 0), (5, 2.5, 4)]\n}\n';
 expect(parseScanUsda(usda,true).ok).toBe(true);
 for(const method of [0,8]){const r=parseScanUsdz(zip('room.usda',Buffer.from(usda),method),'ab'.repeat(32),false,{},d=>new Uint8Array(inflateRawSync(d)));expect(r.ok&&r.parser).toBe('local');expect(r.ok&&r.measures).toMatchObject({width:5,depth:4,height:2.5});}
 expect(readZipEntries(zip('a.usdc',Buffer.from('PXR-USDC'))!.slice())?.[0]?.name).toBe('a.usdc');
 const binary=parseScanUsdz(zip('room.usdc',Buffer.from('PXR-USDC....')),'ab'.repeat(32),false);expect(binary.ok&&binary.parser).toBe('simulado');
 expect(parseScanUsdz(new Uint8Array([1,2,3,4,5]),'00',false).ok).toBe(false);
});
