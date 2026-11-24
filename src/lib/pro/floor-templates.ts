import {floorObjectSize,floorPlanContentSchema,round3,type FloorObjectKind,type FloorPlanContent} from '@/lib/pro/floor-plan';

/**
 * Area E row 15: starting points for the floor planner (room templates). Each one is a rectangular room with a door, a
 * window and the usual furniture, authored in metres and converted to the plan unit. Names and labels are ContrataCR's own.
 */
export const floorTemplateKeys=['kitchen','bathroom','living','bedroom','dining','office','closet'] as const;
export type FloorTemplateKey=(typeof floorTemplateKeys)[number];
type Spec={w:number;d:number;es:string;en:string;door:{wall:'n'|'s'|'e'|'w';offset:number};window:{wall:'n'|'s'|'e'|'w';offset:number}|null;objects:[FloorObjectKind,number,number,0|90|180|270][]};
const specs:Record<FloorTemplateKey,Spec>={
 kitchen:{w:4,d:3.2,es:'Cocina',en:'Kitchen',door:{wall:'w',offset:1},window:{wall:'n',offset:1.4},objects:[['fridge',0.45,0.4,0],['stove',1.4,0.4,0],['sink',2.4,0.4,0],['cabinet',3.3,0.4,0],['table',2,2.2,0],['chair',1.5,2.9,0],['chair',2.5,2.9,0]]},
 bathroom:{w:2.4,d:2.2,es:'Baño',en:'Bathroom',door:{wall:'s',offset:0.7},window:{wall:'n',offset:0.8},objects:[['toilet',0.5,0.45,0],['sink',1.3,0.35,0],['shower',1.9,1.7,0]]},
 living:{w:5,d:4,es:'Sala',en:'Living room',door:{wall:'s',offset:0.6},window:{wall:'n',offset:1.8},objects:[['sofa',2.5,3.4,180],['table',2.5,2.1,0],['cabinet',4.6,0.5,0],['chair',0.6,2.2,90]]},
 bedroom:{w:4,d:3.6,es:'Dormitorio',en:'Bedroom',door:{wall:'s',offset:0.5},window:{wall:'e',offset:1.2},objects:[['bed',2,1.2,0],['wardrobe',3.2,3.2,0],['desk',0.7,3.1,0],['chair',0.7,2.5,0]]},
 dining:{w:4,d:3.5,es:'Comedor',en:'Dining room',door:{wall:'w',offset:1.2},window:{wall:'n',offset:1.4},objects:[['table',2,1.75,0],['chair',1.3,0.8,0],['chair',2.7,0.8,0],['chair',1.3,2.7,0],['chair',2.7,2.7,0],['cabinet',3.6,0.4,0]]},
 office:{w:3.2,d:3,es:'Oficina en casa',en:'Home office',door:{wall:'s',offset:0.5},window:{wall:'n',offset:1},objects:[['desk',1.6,0.5,0],['chair',1.6,1.2,0],['cabinet',2.9,2.6,0],['wardrobe',0.7,2.6,0]]},
 closet:{w:2.5,d:1.8,es:'Clóset',en:'Closet',door:{wall:'s',offset:0.7},window:null,objects:[['wardrobe',0.65,0.35,0],['wardrobe',1.85,0.35,0]]},
};
export const floorTemplateName=(key:FloorTemplateKey,en:boolean)=>en?specs[key].en:specs[key].es;
export function floorTemplateContent(key:FloorTemplateKey,unit:'m'|'ft'):FloorPlanContent{
 const s=specs[key],k=unit==='ft'?3.28084:1,c=(n:number)=>round3(n*k);
 const pts:[number,number][]=[[0,0],[c(s.w),0],[c(s.w),c(s.d)],[0,c(s.d)]];
 const walls=pts.map((a,i)=>({id:'w'+(i+1),a,b:pts[(i+1)%4]!,thickness:round3(0.15*k)}));
 const wallOf={n:'w1',e:'w2',s:'w3',w:'w4'} as const;
 // Wall 3 (south) runs east to west and wall 4 (west) runs south to north, so their offsets are measured from those ends.
 const openings:FloorPlanContent['openings']=[{id:'o1',wallId:wallOf[s.door.wall],kind:'door',offset:c(s.door.offset),width:c(0.9)}];
 if(s.window)openings.push({id:'o2',wallId:wallOf[s.window.wall],kind:'window',offset:c(s.window.offset),width:c(1.2)});
 const objects=s.objects.map(([kind,x,y,rotation],i)=>{const [w,d]=floorObjectSize[kind];return {id:'t'+(i+1),kind,x:c(x),y:c(y),w:c(w),d:c(d),rotation};});
 return floorPlanContentSchema.parse({walls,openings,rooms:[{id:'r1',name:s.es,points:pts}],dimensions:[],wallHeight:round3(2.4*k),objects});
}
/** The room carries the Spanish name in the stored plan; this returns the same content with the name in the chosen language. */
export function floorTemplate(key:FloorTemplateKey,unit:'m'|'ft',en:boolean):FloorPlanContent{
 const content=floorTemplateContent(key,unit);return {...content,rooms:content.rooms.map(r=>({...r,name:floorTemplateName(key,en)}))};
}
