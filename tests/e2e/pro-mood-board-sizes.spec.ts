import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';
import {moodPageFormats,moodPageRatio} from '../../src/lib/pro/mood-boards';

// Area E: mood board page sizes (16:9, 4:3, A4, A3, US Letter, US Tabloid). Disposable accounts, loopback only.
test('Mood board page sizes',async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);
 expect([...moodPageFormats].sort()).toEqual(['a3','a4','letter','standard','tabloid','wide']);
 for(const format of moodPageFormats)expect(moodPageRatio[format]).toBeGreaterThan(0.5);expect(moodPageRatio.standard).toBeCloseTo(0.75);
 const f=await ownerFixture(page.context(),'sz'+randomBytes(3).toString('hex'));
 try{
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/mood-boards',{headers:headersFor(f.owner),data});
  for(const format of ['standard','letter','tabloid','a3','a4','wide']){
   const r=await post({action:'board_create',actionId:crypto.randomUUID(),workId:f.workId,id:crypto.randomUUID(),pageId:crypto.randomUUID(),name:'Tablero '+format,room:null,pageFormat:format});
   expect(r.status(),format+' '+await r.text()).toBe(200);expect((await r.json()).board.pageFormat).toBe(format);
  }
  const bad=await post({action:'board_create',actionId:crypto.randomUUID(),workId:f.workId,id:crypto.randomUUID(),pageId:crypto.randomUUID(),name:'x',room:null,pageFormat:'square'});expect(bad.status()).toBe(400);
 }finally{await f.cleanup();}
});
