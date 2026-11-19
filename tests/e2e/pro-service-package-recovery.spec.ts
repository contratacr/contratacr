import {test,expect} from 'playwright/test';
import {parseServicePackageRecovery,readServicePackageRecovery,writeServicePackageRecovery,clearServicePackageRecovery,servicePackageRecoveryKey,verifyServicePackageCanonical} from '../../src/lib/pro/service-package-recovery';
const id='82000000-0000-4000-8000-000000000001',requestId='82000000-0000-4000-8000-000000000002';
const values=new Map<string,string>();let original:PropertyDescriptor|undefined;
test.beforeEach(()=>{values.clear();original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});});
test.afterEach(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');});
for(const action of ['save','archive','restore'] as const)test(`${action} retains exact body and account scope until explicitly confirmed`,()=>{
 const body=JSON.stringify({action,id,requestId,revision:14,...action==='save'?{package:{name:'Maintenance',notes:'Scope',lines:[{kind:'service',description:'Review',quantity:'2',unitPrice:'1000',sku:'',unit:'',cabys:''}]}}:{}});
 const record={version:2 as const,body,editing:action==='save'?null:id,ack:null};
 writeServicePackageRecovery('a',record);expect(readServicePackageRecovery('a')).toEqual(record);expect(readServicePackageRecovery('b')).toBeNull();
 writeServicePackageRecovery('a',{...record,ack:{id,revision:15}});expect(readServicePackageRecovery('a')).toEqual({...record,ack:{id,revision:15}});
 clearServicePackageRecovery('b',body);expect(readServicePackageRecovery('a')?.body).toBe(body);
 clearServicePackageRecovery('a',body);expect(readServicePackageRecovery('a')).toBeNull();
});
test('corrupt or incoherent records are retained and block recovery',()=>{
 for(const value of ['{broken',JSON.stringify({version:1,body:'{}',editing:null,confirmed:true}),JSON.stringify({version:2,body:JSON.stringify({action:'archive',id,requestId,revision:1}),editing:null,ack:null}),JSON.stringify({version:2,body:'{}',editing:null,ack:null})]){
  values.set(servicePackageRecoveryKey('a'),value);expect(()=>readServicePackageRecovery('a')).toThrow();expect(values.get(servicePackageRecoveryKey('a'))).toBe(value);
 }
 expect(()=>parseServicePackageRecovery({version:2,body:'x'.repeat(100001),editing:null,ack:null})).toThrow();
});
test('storage failure is explicit rather than an empty recovery',()=>{
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Denied');}});
 expect(()=>readServicePackageRecovery('a')).toThrow('Denied');expect(()=>clearServicePackageRecovery('a','x')).toThrow('Denied');
});

test('cannot overwrite or clear a different attempt, or downgrade a confirmed receipt',()=>{
 const record={version:2 as const,body:JSON.stringify({action:'archive',id,revision:1,requestId}),editing:id,ack:null};
 writeServicePackageRecovery('a',record);
 expect(()=>writeServicePackageRecovery('a',{...record,body:JSON.stringify({action:'restore',id,revision:1,requestId})})).toThrow();
 expect(()=>clearServicePackageRecovery('a','different')).toThrow();
 writeServicePackageRecovery('a',{...record,ack:{id,revision:2}});expect(()=>writeServicePackageRecovery('a',record)).toThrow();
 expect(readServicePackageRecovery('a')?.ack).toEqual({id,revision:2});
});
test('silent storage drops are detected before sending',()=>{
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>undefined}});
 expect(()=>writeServicePackageRecovery('a',{version:2,body:JSON.stringify({action:'archive',id,revision:1,requestId}),editing:id,ack:null})).toThrow('Recovery write not retained');
});

test('ACK followed by newer canonical changes completes but same-revision mismatch blocks',()=>{
 const content={name:'Updated',notes:'',lines:[{kind:'service',description:'Visit',quantity:'1',unitPrice:'100',sku:'',unit:'',cabys:''}]};
 const record={version:2 as const,body:JSON.stringify({action:'archive',id,revision:1,requestId}),editing:id,ack:{id,revision:2}};
 expect(()=>verifyServicePackageCanonical(record,{revision:2,items:[{...content,id,archived:false}]})).toThrow('Canonical mismatch');
 expect(verifyServicePackageCanonical(record,{revision:3,items:[{...content,id,archived:false}]})).toBe(true);
 expect(verifyServicePackageCanonical(record,{revision:2,items:[{...content,id,archived:true}]})).toBe(false);
 expect(()=>verifyServicePackageCanonical(record,{revision:1,items:[{...content,id,archived:true}]})).toThrow();
 expect(()=>parseServicePackageRecovery({...record,ack:{id:requestId,revision:2}})).toThrow();
 expect(()=>parseServicePackageRecovery({...record,ack:{id,revision:99}})).toThrow();
});
