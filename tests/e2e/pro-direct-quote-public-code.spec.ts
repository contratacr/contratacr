import {test,expect} from 'playwright/test';
import {directProjectPublicCode} from '../../src/lib/pro/direct-project-quotes';
test('every random byte produces a public quote code preserved by lowercase lookup',()=>{
 for(let value=0;value<256;value++){
  const code=directProjectPublicCode(Uint8Array.from({length:12},(_,i)=>(value+i)%256));
  expect(code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/);
  expect(code.toLowerCase()).toBe(code);
  expect(decodeURIComponent(encodeURIComponent(code))).toBe(code);
 }
 expect(()=>directProjectPublicCode(new Uint8Array(0))).toThrow();
});
