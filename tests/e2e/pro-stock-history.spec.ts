import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow} from './helpers';
test('Pro inventory: newest movement first, complete descending history and unchanged original records',async({page,baseURL})=>{
 test.setTimeout(90000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-stock-history'}),db=regressionAdminClient();
 try{
  await db.from('profiles').update({is_provider:true}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const doc=emptyBusiness();doc.products=[{id:'history-product',sku:'HIST-001',name:'Material de movimientos',stock:47,minimum:1,cost:100,price:200,archived:false}];
  for(let i=0;i<47;i++)doc.movements.push({id:'move-'+String(i).padStart(3,'0'),productId:'history-product',delta:1,reason:'Entrada '+String(i).padStart(3,'0'),at:new Date(Date.UTC(2026,9,1,12,i)).toISOString()});
  await db.from('pro_workspaces').insert({user_id:owner.id,document:doc,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  const found:string[]=[];let after='';
  do{const response=await page.request.get('/api/pro/catalog?'+new URLSearchParams({kind:'movements',q:'history-product',after}));expect(response.status()).toBe(200);const body=await response.json();expect(body.items.length).toBeLessThanOrEqual(20);found.push(...body.items.map((row:{id:string})=>row.id));after=body.nextCursor??'';}while(after);
  expect(found).toEqual(doc.movements.map(row=>row.id).reverse());expect(new Set(found).size).toBe(47);
  await page.goto('/es/dashboard/profesional?tab=pro_inventory');await page.getByRole('button',{name:/^Material de movimientos · HIST-001/}).click();
  const detail=page.getByRole('dialog');await expect(detail.getByText(/Entrada 046/)).toBeVisible();await expect(detail.getByText(/Entrada 000/)).toHaveCount(0);
  const reasons=detail.locator('p').filter({hasText:/Entrada \d{3}/});await expect(reasons).toHaveCount(20);await expect(reasons.first()).toContainText('Entrada 046');
  await detail.getByRole('button',{name:'Ver más movimientos',exact:true}).click();await expect(reasons).toHaveCount(40);await expect(reasons.first()).toContainText('Entrada 046');
  await detail.getByRole('button',{name:'Ver más movimientos',exact:true}).click();await expect(reasons).toHaveCount(47);await expect(reasons.last()).toContainText('Entrada 000');await expectNoHorizontalOverflow(page);
  expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual({document:doc,revision:1});
 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});
