import {test,expect} from 'playwright/test';
import {build} from 'esbuild';
import {emptyBusiness,saveClient,saveProduct,moveStock,saveQuote,saveAppointment,quoteTotal} from '../../src/lib/pro/business';
test('inventory mutations preserve history and reject overdrafts and duplicate codes',()=>{
 let s=saveProduct(emptyBusiness(),{id:'p',sku:'A',name:'Cable',stock:5,minimum:2,cost:100,price:200,archived:false});
 expect(()=>saveProduct(s,{...s.products[0],id:'other',sku:'a'})).toThrow();
 expect(()=>moveStock(s,'p',-6,'Consumo','m','2026-10-23')).toThrow();
 s=moveStock(s,'p',-3,'Trabajo','m','2026-10-23');
 expect(s.products[0].stock).toBe(2);expect(moveStock(s,'p',-3,'Trabajo','m','2026-10-23')).toEqual(s);
 expect(()=>saveProduct(s,{...s.products[0],stock:8})).toThrow();
});
test('quotes preserve resolved values and only matching accepted quotes can be scheduled',()=>{
 let s=saveClient(emptyBusiness(),{id:'c',name:'Cliente',email:'',phone:'',notes:'',archived:false});
 const q={id:'q',clientId:'c',title:'Trabajo',lines:[{description:'Servicio',quantity:2,price:100,tax:13}],status:'draft' as const,validUntil:'2026-11-30'};
 expect(quoteTotal(q.lines)).toBe(226);s=saveQuote(s,q);
 const appointment={id:'a',client:'Cliente',clientId:'c',service:'Trabajo',stage:'scheduled' as const,start:'2026-11-01T09:00:00-06:00',end:'2026-11-01T10:00:00-06:00',cancelled:false,quoteId:'q'};
 expect(()=>saveAppointment(s,appointment)).toThrow();s=saveQuote(s,{...q,status:'accepted'});
 expect(()=>saveQuote(s,{...q,title:'Alterada'})).toThrow();s=saveAppointment(s,appointment);
 expect(()=>saveAppointment(s,{...appointment,id:'b'})).toThrow();
 s=saveAppointment(s,{...appointment,cancelled:true});expect(saveAppointment(s,{...appointment,id:'b'}).work).toHaveLength(2);
});
test('local workspace keeps clients in the session and links agenda and quotations',async({page})=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{NextIntlClientProvider}from'next-intl';import{ProWorkspace}from'./src/components/pro/pro-workspace';createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="es" messages={{}}><ProWorkspace/></NextIntlClientProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',define:{'process.env':JSON.stringify({NODE_ENV:'test'})},platform:'browser',jsx:'automatic'});
 await page.route('**/pro-harness',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
 const open=async()=>{await page.goto('/pro-harness');await page.addScriptTag({content:bundle.outputFiles[0].text});};await open();
 await page.getByRole('button',{name:'Clientes',exact:true}).click();await page.getByRole('button',{name:'Nuevo cliente',exact:true}).click();
 await page.getByLabel('Nombre',{exact:true}).fill('Cliente de prueba');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Cliente de prueba'})).toBeVisible();
 // The local preview keeps records in memory only (reload clears them, see the banner), so the flow continues in the same session.
 await page.getByRole('button',{name:'Agenda',exact:true}).click();await page.getByRole('button',{name:'Nueva cita',exact:true}).click();
 await page.getByLabel('Cliente',{exact:true}).selectOption({label:'Cliente de prueba'});await page.getByLabel('Trabajo',{exact:true}).fill('Reparación');
 await page.getByLabel('Inicio · Costa Rica').fill('2026-11-01T09:00');await page.getByLabel('Final · Costa Rica').fill('2026-11-01T10:00');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Cliente de prueba · Reparación'})).toBeVisible();
 await page.getByRole('button',{name:'Cotizaciones',exact:true}).click();await page.getByRole('button',{name:'Nueva cotización',exact:true}).click();
 await page.getByLabel('Cliente',{exact:true}).selectOption({label:'Cliente de prueba'});await page.getByLabel('Título',{exact:true}).fill('Reparación');await page.getByLabel('Válida hasta').fill('2026-11-30');await page.getByLabel('Descripción',{exact:true}).fill('Servicio');await page.getByLabel('Precio ₡',{exact:true}).fill('1000');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.getByRole('button',{name:'Registrar aceptación'}).click();await expect(page.getByText(/Aceptada/)).toBeVisible();
 await page.getByRole('button',{name:'Inventario',exact:true}).click();await page.getByRole('button',{name:'Nuevo producto',exact:true}).click();
 // The local preview retains its legacy Product label; account-backed Pro has its own form coverage.
 await page.getByLabel('Código',{exact:true}).fill('CAB-1');await page.getByLabel('Producto',{exact:true}).fill('Cable');
 for(const [label,value] of [['Existencias iniciales','5'],['Mínimo','2'],['Costo unitario ₡','100'],['Precio unitario ₡','200']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByLabel('Cantidad del movimiento').fill('-6');await page.getByLabel('Motivo del movimiento').fill('Trabajo');await page.getByRole('button',{name:'Registrar movimiento'}).click();await expect(page.getByRole('alert')).toContainText('negativas');
 await page.getByLabel('Cantidad del movimiento').fill('-3');await page.getByRole('button',{name:'Registrar movimiento'}).click();await expect(page.getByText(/2 unidades/)).toBeVisible();await expect(page.getByText(/Existencias bajas/)).toBeVisible();

});
