// Design: mood boards (colour swatches, text, notes and a catalogue item, no images) and a 2D/3D floor plan
// (pure JSON: walls, openings, rooms, dimensions, objects). Same writers as /api/pro/mood-boards and /floor-plans.
// Boards are NOT published (publishing shows them to the linked customer). Takeoffs (Mediciones) are skipped:
// plan_create needs an uploaded JPG of the plan (the route reads its size with sharp) and the demo carries no images.
import {uuid,tid,must,appModules} from '../lib.mjs';

const k=(...p)=>uuid(['design',...p].join(':'));
const box=(x,y,w,h)=>({x,y,w,h,rotation:0});
const sw=(key,x,y,color,label)=>({kind:'swatch',id:k(key),...box(x,y,1400,1400),color,label});
const BOARDS=[
 {key:'p1-cocina',work:'p1',name:'Cocina y baño: acabados (Ejemplo)',room:'Cocina',format:'wide',pages:[
  {name:'Cocina',background:'#f7f4ef',elements:key=>[
   {kind:'text',id:k(key,'title'),...box(400,300,6000,700),text:'Cocina cálida con cuarzo claro y madera (Ejemplo)',color:'#162543'},
   sw(key+':s1',400,1300,'#f2efe9','Cuarzo blanco nube'),sw(key+':s2',2000,1300,'#c8a27a','Melamina roble claro'),
   sw(key+':s3',3600,1300,'#3f4a55','Gris grafito (tiradores)'),sw(key+':s4',5200,1300,'#e6e2da','Pared: blanco hueso'),
   {kind:'product',id:k(key,'prod'),...box(6900,1300,2600,2600),productId:tid('prod-porcelanato'),fileId:null,showPrice:true},
   {kind:'note',id:k(key,'note'),...box(400,3200,6000,1400),text:'Propuesta para revisar con usted: sobre claro, muebles en roble y tiradores oscuros. Los colores son de referencia.'},
  ]},
  {name:'Baño principal',background:'#ffffff',elements:key=>[
   {kind:'text',id:k(key,'title'),...box(400,300,6000,700),text:'Baño principal: tonos neutros (Ejemplo)',color:'#162543'},
   sw(key+':s1',400,1300,'#ffffff','Porcelanato 30×60 blanco'),sw(key+':s2',2000,1300,'#9aa3a8','Junta gris cemento'),
   sw(key+':s3',3600,1300,'#1f1f1f','Grifería negro mate'),
   {kind:'arrow',id:k(key,'arrow'),...box(5200,1500,1500,800),color:'#00a3c4',points:[[0,500],[1000,500]]},
   {kind:'note',id:k(key,'note'),...box(6900,1300,2600,1600),text:'Piso de ducha antideslizante, mismo tono que las paredes.'},
  ]},
 ]},
 {key:'p6-pintura',work:'p6',name:'Paleta de pintura interior (Ejemplo)',room:'Sala y pasillos',format:'a4',pages:[
  {name:'Paleta principal',background:'#fbfaf8',elements:key=>[
   {kind:'text',id:k(key,'title'),...box(500,400,9000,800),text:'Paleta propuesta para sala, pasillo y cuartos (Ejemplo)',color:'#162543'},
   sw(key+':s1',500,1500,'#efe9df','Sala: arena suave'),sw(key+':s2',2600,1500,'#d9dfd6','Pasillo: verde salvia claro'),
   sw(key+':s3',4700,1500,'#e3e7ee','Cuartos: gris azulado'),sw(key+':s4',6800,1500,'#ffffff','Cielos: blanco mate'),
   {kind:'note',id:k(key,'note'),...box(500,3400,9000,1500),text:'Acabado lavable en áreas de paso. Le recomendamos aprobar la muestra en pared antes de comprar toda la pintura.'},
  ]},
 ]},
];
// Floor plan of p1 in metres: kitchen 4 × 3,5 and main bathroom 2,4 × 2 beside it.
const W=(id,a,b)=>({id,a,b,thickness:0.15});
const PLAN={key:'p1-plano',work:'p1',name:'Planta cocina y baño principal (Ejemplo)',unit:'m',content:{
 walls:[W('w1',[0,0],[4,0]),W('w2',[4,0],[4,3.5]),W('w3',[4,3.5],[0,3.5]),W('w4',[0,3.5],[0,0]),W('w5',[4,0],[6.4,0]),W('w6',[6.4,0],[6.4,2]),W('w7',[6.4,2],[4,2])],
 openings:[{id:'o1',wallId:'w3',kind:'door',offset:1.5,width:0.9},{id:'o2',wallId:'w1',kind:'window',offset:1,width:1.5},{id:'o3',wallId:'w7',kind:'door',offset:0.8,width:0.8},{id:'o4',wallId:'w6',kind:'window',offset:0.7,width:0.6}],
 rooms:[{id:'r1',name:'Cocina',points:[[0,0],[4,0],[4,3.5],[0,3.5]]},{id:'r2',name:'Baño principal',points:[[4,0],[6.4,0],[6.4,2],[4,2]]}],
 dimensions:[{id:'d1',a:[0,-0.4],b:[4,-0.4]},{id:'d2',a:[-0.4,0],b:[-0.4,3.5]},{id:'d3',a:[4,-0.4],b:[6.4,-0.4]}],
 wallHeight:2.6,level:{name:'Primer piso',order:1},
 objects:[{id:'f1',kind:'stove',x:0.5,y:0.4,w:0.76,d:0.65,rotation:0},{id:'f2',kind:'fridge',x:3.5,y:0.45,w:0.8,d:0.75,rotation:0},{id:'f3',kind:'sink',x:2,y:0.35,w:0.6,d:0.5,rotation:0},
  {id:'f4',kind:'table',x:2,y:2.3,w:1.6,d:0.9,rotation:0},{id:'f5',kind:'toilet',x:5.9,y:0.45,w:0.4,d:0.7,rotation:0},{id:'f6',kind:'shower',x:4.55,y:0.55,w:0.9,d:0.9,rotation:0},{id:'f7',kind:'sink',x:5.4,y:1.65,w:0.6,d:0.5,rotation:180}],
}};

export async function seed(ctx){
 const {db,apply,owner,log}=ctx,S='design';
 if(!apply){Object.assign(ctx.counts,{mood_boards:BOARDS.length,mood_board_pages:BOARDS.reduce((n,b)=>n+b.pages.length,0),floor_plans:1});log(S,'dry run: would seed 2 mood boards and 1 floor plan');return;}
 const app=appModules("export {moodBoardMutationSchema} from './src/lib/pro/mood-boards';export {floorPlanContentSchema} from './src/lib/pro/floor-plan';");
 const mood=input=>must(`mood ${input.action}`,db.rpc('pro_mood_boards_mutate',{p_actor:owner,p_input:app.moodBoardMutationSchema.parse(input)}));
 const one=(table,filter)=>must(table,filter(db.from(table).select('*').eq('owner_id',owner)).maybeSingle());
 let writes=0;
 for(const b of BOARDS){
  const id=k(b.key),workId=tid(b.work),pageIds=b.pages.map((_,n)=>k(b.key,'page',n));
  if(!await one('pro_mood_boards',q=>q.eq('id',id))){await mood({action:'board_create',actionId:k(b.key,'create'),workId,id,pageId:pageIds[0],name:b.name,room:b.room,pageFormat:b.format});writes++;}
  for(const [n,page] of b.pages.entries()){
   const pageId=pageIds[n];let cur=await one('pro_mood_board_pages',q=>q.eq('id',pageId));
   if(!cur){const board=await one('pro_mood_boards',q=>q.eq('id',id));await mood({action:'page_add',actionId:k(b.key,'page',n,'add'),workId,id,revision:board.revision,pageId});writes++;cur=await one('pro_mood_board_pages',q=>q.eq('id',pageId));}
   if(!(cur.elements||[]).length){await mood({action:'page_save',actionId:k(b.key,'page',n,'save'),workId,id,revision:cur.revision,pageId,name:page.name,background:page.background,elements:page.elements(`${b.key}:${n}`)});writes++;}
  }
 }
 const planId=k(PLAN.key);
 if(!await one('pro_floor_plans',q=>q.eq('id',planId))){
  const content=app.floorPlanContentSchema.parse(PLAN.content);
  await must('floor plan',db.rpc('pro_floor_plan_mutate',{p_actor:owner,p_input:{action:'create',actionId:k(PLAN.key,'create'),id:planId,workId:tid(PLAN.work),name:PLAN.name,unit:PLAN.unit,content}}));writes++;
 }
 const ids=BOARDS.map(b=>k(b.key));
 const count=async(table,f)=>{const {count:n,error}=await f(db.from(table).select('*',{count:'exact',head:true}).eq('owner_id',owner));if(error)throw new Error(`${table}: ${error.message}`);return n;};
 Object.assign(ctx.counts,{mood_boards:await count('pro_mood_boards',q=>q.in('id',ids)),mood_board_pages:await count('pro_mood_board_pages',q=>q.in('board_id',ids)),floor_plans:await count('pro_floor_plans',q=>q.eq('id',planId))});
 log(S,`${writes} writes`);
}
