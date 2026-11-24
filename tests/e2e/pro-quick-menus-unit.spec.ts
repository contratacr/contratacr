import {test,expect} from 'playwright/test';
import {proHelpGroups,proQuickGroups,proSettingsGroups} from '../../src/lib/pro/quick-menus';

// Area A (global chrome): the Search, Help and Settings menus of the Pro header only point at real Pro sections, in both languages.
const validTabs=new Set(['quotes','pro_projects','pro_tasks','pro_hours','pro_expenses','pro_leads','pro_billing','pro_payments','pro_company','pro_notifications','pro_inventory']);
for(const en of [false,true])test(`quick menus: groups, unique keys and valid destinations [${en?'en':'es'}]`,()=>{
 const all=[...proQuickGroups(en),...proHelpGroups(en),...proSettingsGroups(en)];
 expect(proQuickGroups(en).map(group=>group.key)).toEqual(['planning','management','finance']);
 expect(proSettingsGroups(en).map(group=>group.key)).toEqual(['company','account','integrations']);
 for(const group of all){expect(group.label.trim()).not.toBe('');expect(new Set(group.items.map(item=>item.key)).size).toBe(group.items.length);
  for(const item of group.items){expect(validTabs.has(item.tab),item.key).toBe(true);expect(item.label.trim()).not.toBe('');}}
 const text=JSON.stringify(all);
 expect(en?/[áéíóúñ¿¡]/i.test(text):/\bAll quotes\b/.test(text)).toBe(false);
});
test('quick menus: Spanish uses the agreed section names',()=>{
 const labels=proQuickGroups(false).flatMap(group=>group.items.map(item=>item.label));
 expect(labels).toContain('Todas las cotizaciones');expect(labels).toContain('Centro de tareas');
});
