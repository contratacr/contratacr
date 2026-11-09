import { chromium, webkit, expect } from 'playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { jsPDF } from 'jspdf';
const xml=lines=>'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+lines.map(l=>`<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join('')+'</w:body></w:document>';
const docx=lines=>Buffer.from(zipSync({'word/document.xml':strToU8(xml(lines))}));
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch();const page=await browser.newPage({viewport:{width:390,height:844}});
 try {
  await page.goto('http://127.0.0.1:3194/?lang=en');
  const input=page.locator('input[type=file][accept*=".docx"]');
  const review=page.getByLabel('Review imported information',{exact:true});
  const buffer=docx(['Education','Technical course','Example Institute','01/2018 – 12/2020','','Skills','Excel; Organization']);
  await input.setInputFiles({name:'cv.docx',mimeType:'application/octet-stream',buffer});
  await expect(review).toBeVisible();await review.getByRole('button',{name:'Add to my profile form'}).click();
  await input.setInputFiles({name:'cv.docx',mimeType:'application/octet-stream',buffer});
  await expect(review).toBeVisible();await review.getByRole('button',{name:'Add to my profile form'}).click();
  await expect(page.getByLabel('Qualification or course',{exact:true})).toHaveCount(1);
  await page.getByTestId('profile-save-certs').click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('cv-saved')||'{}').education?.length)).toBe(1);
  await page.reload();
  await page.getByRole('button',{name:'Remove Education 1',exact:true}).click();
  await page.getByRole('button',{name:'Remove Excel',exact:true}).click();
  await page.getByRole('button',{name:'Remove Organization',exact:true}).click();
  await page.getByTestId('profile-save-certs').click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('cv-saved')||'{}').education?.length)).toBe(0);
  await page.reload();
  const pages=new jsPDF();for(let i=1;i<16;i++)pages.addPage();
  const cases=[
   ['pages.pdf',Buffer.from(pages.output('arraybuffer')),'15 pages'],
   ['bomb.docx',Buffer.from(zipSync({'word/document.xml':strToU8('x'.repeat(2*1024*1024))})),'too large'],
   ['malformed.docx',Buffer.from(zipSync({'word/document.xml':strToU8('<wrong>')})),'could not read'],
   ['unknown.docx',docx(['A name','A phone','No recognized sections here']),'No education'],
  ];
  for(const [filename,data,message] of cases){await input.setInputFiles({name:filename,mimeType:'application/octet-stream',buffer:data});await expect(page.getByRole('alert')).toContainText(message,{timeout:25000});}
  console.log(`PASS ${name}: English, duplicate reimport, confirmed deletion, page limit, compressed XML limit, malformed XML, no recognized headings`);
 }finally{await browser.close();}
}
