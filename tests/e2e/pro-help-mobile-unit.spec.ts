import {test,expect} from 'playwright/test';
import {helpArticles,helpAreas,helpQuickTopics,fold} from '../../src/lib/pro/help-content';

// Area E: help center, mobile app category. Pure data, runs offline.
test('Help center: every article is bilingual, belongs to a known area, and the mobile app has its own category',()=>{
 expect(new Set(helpArticles.map(a=>a.key)).size).toBe(helpArticles.length);
 for(const a of helpArticles){expect(Object.keys(helpAreas)).toContain(a.area);expect(a.title.es&&a.title.en&&a.body.es&&a.body.en).toBeTruthy();expect(a.body.es).not.toMatch(/[«»“”]/);expect(a.body.en).not.toMatch(/[«»“”]/);}
 expect(helpArticles.filter(a=>a.area==='mobile').length).toBeGreaterThanOrEqual(5);
 expect(helpAreas.mobile).toEqual({es:'Aplicación móvil',en:'Mobile app'});
});

// Area E: help center categories (Houzz-style Browse by feature). Pure data, runs offline.
test('Help center: every category has guides, every guide opens a known place, quick topics find results',()=>{
 expect(helpArticles.length).toBeGreaterThanOrEqual(60);
 for(const area of Object.keys(helpAreas))expect(helpArticles.filter(a=>a.area===area).length,area).toBeGreaterThanOrEqual(2);
 for(const key of ['getting_started','floor_planner','takeoffs','documents','selections','mood_boards','clipper','client_comms','ai','policies'])expect(Object.keys(helpAreas)).toContain(key);
 for(const a of helpArticles)expect(a.title.es+a.body.es+a.title.en+a.body.en).not.toMatch(/[—–]/);
 for(const topic of helpQuickTopics)for(const lang of ['es','en'] as const)expect(helpArticles.filter(a=>fold(a.title[lang]+' '+a.body[lang]).includes(fold(topic.query[lang]))).length,topic.label[lang]).toBeGreaterThan(0);
});
