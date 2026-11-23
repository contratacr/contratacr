import {test,expect} from 'playwright/test';
import {elementsFromTemplate,isTemplateElement,moodTemplateMutationSchema,savedMoodTemplateSchema,templateFromPage} from '../../src/lib/pro/mood-board-templates';
import {moodElementInput,type MoodDraftElement} from '../../src/lib/pro/mood-boards';
import {moodTemplateElements} from '../../src/lib/pro/round12';
import {notificationEvents,notificationInputSchema} from '../../src/lib/pro/round9';

// Rows 61 and 62 — unit-level checks (no browser, no server, no database): own page templates keep only the layout, apply with
// fresh ids and are validated like the page writer; the notification center knows the selection decision event.
const id=()=>crypto.randomUUID();
const page=():{background:string;elements:MoodDraftElement[]}=>({background:'#f7f9fc',elements:[
 {kind:'swatch',id:id(),x:100,y:100,w:1500,h:1500,rotation:0,color:'#008bb5',label:'Principal'},
 {kind:'note',id:id(),x:2000,y:100,w:2500,h:1500,rotation:0,text:'Piso de la sala'},
 {kind:'image',id:id(),x:100,y:2000,w:3000,h:3000,rotation:0,fileId:id()},
 {kind:'product',id:id(),x:3500,y:2000,w:2500,h:2000,rotation:0,productId:'p1',fileId:null,showPrice:true,name:'Porcelanato',unit:'m2',priceCents:1250050},
 {kind:'arrow',id:id(),x:6000,y:100,w:2000,h:800,rotation:0,color:'#d14343',points:[[0,500],[1000,500]]},
]});
test('Row 61: saving a page as a template drops photos and items and keeps the layout',()=>{
 const source=page(),saved=templateFromPage(source,moodElementInput);
 expect(saved.dropped).toBe(2);expect(saved.elements.map(e=>e.kind)).toEqual(['swatch','note','arrow']);expect(saved.background).toBe('#f7f9fc');
 expect(saved.elements.every(isTemplateElement)).toBe(true);
 // The stored element has exactly the writer's keys (no product snapshot fields).
 expect(Object.keys(saved.elements[0]!).sort()).toEqual(['color','h','id','kind','label','rotation','w','x','y']);
});
test('Row 61: applying a template creates fresh ids every time and never copies photos or items',()=>{
 const saved=templateFromPage(page(),moodElementInput),template={elements:saved.elements};
 let n=0;const a=elementsFromTemplate(template,()=>'00000000-0000-4000-8000-'+String(++n).padStart(12,'0')),b=elementsFromTemplate(template);
 expect(a.map(e=>e.id)).toEqual(['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003']);
 expect(new Set([...a,...b].map(e=>e.id)).size).toBe(6);
 expect(elementsFromTemplate({elements:[...saved.elements,{kind:'image',id:id(),x:0,y:0,w:300,h:300,rotation:0,fileId:id()}]}).length).toBe(3);
});
test('Row 61: template mutations are strict (layout only, bounded, no repeated element ids)',()=>{
 const saved=templateFromPage(page(),moodElementInput),base={action:'create' as const,actionId:id(),id:id(),name:'  Sala  ',pageFormat:'wide' as const,background:saved.background,elements:saved.elements};
 const ok=moodTemplateMutationSchema.safeParse(base);expect(ok.success).toBe(true);if(ok.success&&ok.data.action==='create')expect(ok.data.name).toBe('Sala');
 expect(moodTemplateMutationSchema.safeParse({...base,elements:[...saved.elements,{kind:'image',id:id(),x:0,y:0,w:300,h:300,rotation:0,fileId:id()}]}).success).toBe(false);
 expect(moodTemplateMutationSchema.safeParse({...base,elements:[saved.elements[0],saved.elements[0]]}).success).toBe(false);
 expect(moodTemplateMutationSchema.safeParse({...base,name:'   '}).success).toBe(false);
 expect(moodTemplateMutationSchema.safeParse({...base,background:'red'}).success).toBe(false);
 expect(moodTemplateMutationSchema.safeParse({...base,extra:1}).success).toBe(false);
 expect(moodTemplateMutationSchema.safeParse({action:'rename',actionId:id(),id:id(),revision:2,name:'Nueva'}).success).toBe(true);
 expect(moodTemplateMutationSchema.safeParse({action:'archive',actionId:id(),id:id(),revision:0}).success).toBe(false);
 expect(savedMoodTemplateSchema.safeParse({id:id(),name:'x',pageFormat:'a4',background:'#ffffff',elements:saved.elements,revision:1,updatedAt:new Date().toISOString()}).success).toBe(true);
});
test('Row 61: the built-in starters (round 12) are valid layout-only templates in both languages',()=>{
 for(const template of ['kitchen','bathroom','living','palette'] as const)for(const en of [false,true]){
  const elements=moodTemplateElements(template,en);expect(elements.length).toBeGreaterThan(3);
  const result=moodTemplateMutationSchema.safeParse({action:'create',actionId:id(),id:id(),name:template,pageFormat:'wide',background:'#ffffff',elements});
  expect(result.success,template+(en?' en':' es')).toBe(true);
 }
});
test('Row 62: the notification center knows the selection decision event',()=>{
 expect(notificationEvents).toContain('selection_decided');
 expect(notificationInputSchema.safeParse({action:'settings',actionId:id(),revision:0,dueSoonDays:2,overdueGraceDays:0,prefs:{selection_decided:{inApp:true,email:false}}}).success).toBe(true);
});
