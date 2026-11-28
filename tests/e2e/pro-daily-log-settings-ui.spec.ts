import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {local,ownerFixture} from './pro-round2-fixture';
import {crTodayISO} from '../../src/lib/time-cr';

// Row 20 (migration 405): «Clima y borradores automáticos» of the daily log in the browser. The weather source and place
// are saved by the owner (revision), and the automatic private drafts can be turned on. No real provider is called here
// (the test provider is deterministic and labelled); the adapter and the draft SQL are covered by pro-daily-log-weather.
for(const language of ['es','en'] as const)test(`Daily log weather source and automatic drafts settings [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',tag=randomBytes(3).toString('hex'),day=crTodayISO();
 const f=await ownerFixture(page.context(),tag,(document,{workId})=>{document.work=document.work.map(w=>w.id===workId?{...w,stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T11:00:00-06:00'}:w);});
 try{
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${f.workId}&vistaTrabajo=updates`);
  const panel=page.locator('[data-daily-log-automation]');await expect(panel).toBeVisible({timeout:90000});
  await panel.locator('summary').click();
  const weather=panel.locator('[data-daily-log-weather-settings]');
  await expect(weather.getByRole('heading',{name:en?'Weather':'Clima',exact:true})).toBeVisible();
  await expect(weather.locator('[data-weather-provider]')).toHaveValue('auto');
  await weather.locator('[data-weather-provider]').selectOption('sandbox');
  await weather.locator('[data-weather-place]').fill('Obra Norte '+tag);
  await weather.locator('[data-weather-lat]').fill('10,5');await weather.locator('[data-weather-lat]').blur();
  await weather.locator('[data-weather-save]').click();
  await expect(panel.locator('[data-daily-log-automation-message]')).toHaveText(en?'Settings saved.':'Configuración guardada.',{timeout:30000});
  const w=(await f.db.from('pro_daily_log_weather_settings').select('provider,place,latitude,revision').eq('owner_id',f.owner.id).single().throwOnError()).data!;
  expect({...w,latitude:Number(w.latitude)}).toEqual({provider:'sandbox',place:'Obra Norte '+tag,latitude:10.5,revision:1});
  const auto=panel.locator('[data-daily-log-auto-settings]');
  await auto.locator('[data-auto-enabled]').check();await auto.locator('[data-auto-days]').selectOption('3');
  await auto.locator('[data-auto-save]').click();
  await expect(panel.locator('[data-daily-log-automation-message]')).toHaveText(en?'Settings saved.':'Configuración guardada.',{timeout:30000});
  expect((await f.db.from('pro_daily_log_automation').select('enabled,lookback_days,revision').eq('owner_id',f.owner.id).single().throwOnError()).data).toEqual({enabled:true,lookback_days:3,revision:1});
  await expectNoHorizontalOverflow(page);
  // Reload: the saved choices come back; nothing was drafted because this job has no work recorded on recent days.
  await page.reload();const again=page.locator('[data-daily-log-automation]');await expect(again).toBeVisible({timeout:90000});await again.locator('summary').click();
  await expect(again.locator('[data-weather-provider]')).toHaveValue('sandbox');await expect(again.locator('[data-weather-place]')).toHaveValue('Obra Norte '+tag);
  await expect(again.locator('[data-auto-enabled]')).toBeChecked();
  expect((await f.db.from('pro_daily_logs').select('id').eq('owner_id',f.owner.id).throwOnError()).data).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await f.cleanup();}
});
