import {test,expect} from 'playwright/test';
import {helpArticles,helpAreas} from '../../src/lib/pro/help-content';

// Area E: help center, mobile app category. Pure data, runs offline.
test('Help center: every article is bilingual, belongs to a known area, and the mobile app has its own category',()=>{
 expect(new Set(helpArticles.map(a=>a.key)).size).toBe(helpArticles.length);
 for(const a of helpArticles){expect(Object.keys(helpAreas)).toContain(a.area);expect(a.title.es&&a.title.en&&a.body.es&&a.body.en).toBeTruthy();expect(a.body.es).not.toMatch(/[«»“”]/);expect(a.body.en).not.toMatch(/[«»“”]/);}
 expect(helpArticles.filter(a=>a.area==='mobile').length).toBeGreaterThanOrEqual(5);
 expect(helpAreas.mobile).toEqual({es:'Aplicación móvil',en:'Mobile app'});
});
