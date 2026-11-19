import {test,expect} from 'playwright/test';

test('Private file policy is retained without changing ordinary API or print policies',async({request,baseURL})=>{
 expect(baseURL).toBe('http://127.0.0.1:3185');
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const files=await request.get('/api/pro/work-files?workId=local');
 expect(files.status()).toBe(401);
 expect(files.headers()['content-security-policy']).toBe("sandbox; default-src 'none'; frame-ancestors 'none'");
 expect(files.headers()['referrer-policy']).toBe('no-referrer');
 expect(files.headers()['x-content-type-options']).toBe('nosniff');
 expect(files.headers()['cache-control']).toContain('no-store');
 const ordinary=await request.get('/api/pro/work-updates?workId=local');
 expect(ordinary.status()).toBe(401);
 expect(ordinary.headers()['content-security-policy']).toBe("frame-ancestors 'self'");
 for(const route of ['/api/pro/invoice-print','/api/pro/payment-receipt-print']){
  const response=await request.get(route);
  expect(response.status()).toBe(401);
  expect(response.headers()['content-security-policy']).toBe("default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(response.headers()['cache-control']).toContain('no-store');
 }
});
