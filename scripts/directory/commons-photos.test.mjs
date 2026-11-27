// Run: node --test scripts/directory/commons-photos.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFileTitle,commonsFileFromUrl,photoRefFromTags,p18FromEntity,freeLicense,attributionFromImageInfo,plainText,USER_AGENT} from './commons-photos.mjs';
import {distinctiveName,containsName,pickCandidate,attributionFromResult,fold,NOTE} from './openverse-photos.mjs';

test('user agent is generic, no personal contact',()=>{assert.equal(USER_AGENT,'ContrataCR-directory/1.0 (generic contact)');assert.ok(!/@/.test(USER_AGENT));});
test('file titles',()=>{
 assert.equal(normalizeFileTitle('File:Foo_bar.jpg'),'File:Foo bar.jpg');
 assert.equal(normalizeFileTitle('Category:Arenal'),null);
 assert.equal(normalizeFileTitle('File:map.svg'),null);
});
test('commons urls only',()=>{
 assert.equal(commonsFileFromUrl('https://commons.wikimedia.org/wiki/File:A_b.jpg'),'File:A b.jpg');
 assert.equal(commonsFileFromUrl('https://upload.wikimedia.org/wikipedia/commons/a/ab/A_b.jpg'),'File:A b.jpg');
 assert.equal(commonsFileFromUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/A_b.jpg/800px-A_b.jpg'),'File:A b.jpg');
 assert.equal(commonsFileFromUrl('https://example.com/a.jpg'),null);
 assert.equal(commonsFileFromUrl('https://maps.google.com/x/File:a.jpg'),null);
});
test('refs from tags',()=>{
 assert.deepEqual(photoRefFromTags({wikimedia_commons:'File:X.jpg',wikidata:'Q1'}),{file:'File:X.jpg',qid:'Q1'});
 assert.deepEqual(photoRefFromTags({wikidata:'Q5'}),{qid:'Q5'});
 assert.equal(photoRefFromTags({image:'https://facebook.com/a.jpg'}),null);
 assert.equal(photoRefFromTags({wikimedia_commons:'Category:X'}),null);
});
test('P18 prefers preferred rank, ignores deprecated',()=>{
 const c=(v,rank)=>({rank,mainsnak:{snaktype:'value',datavalue:{value:v}}});
 assert.equal(p18FromEntity({claims:{P18:[c('A.jpg','normal'),c('B.jpg','preferred'),c('C.jpg','deprecated')]}}),'File:B.jpg');
 assert.equal(p18FromEntity({claims:{P18:[c('C.jpg','deprecated')]}}),null);
});
test('only free licences',()=>{
 const m=s=>({LicenseShortName:{value:s}});
 for(const ok of ['CC BY-SA 4.0','CC BY 2.0','CC0','Public domain','CC BY-SA 2.5 ar'])assert.ok(freeLicense(m(ok)),ok);
 for(const no of ['CC BY-NC 4.0','CC BY-ND 2.0','CC BY-NC-SA 3.0','GFDL','GPL','Fair use','All rights reserved'])assert.equal(freeLicense(m(no)),null,no);
 assert.equal(freeLicense({LicenseShortName:{value:'CC BY 4.0'},Restrictions:{value:'trademarked'}}),null);
});
test('attribution needs author for CC BY, source page always',()=>{
 const info=(artist)=>({descriptionurl:'https://commons.wikimedia.org/wiki/File:A.jpg',extmetadata:{LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0'},...(artist?{Artist:{value:'<a href="x">Ana &amp; Co</a>'}}:{})}});
 const a=attributionFromImageInfo('File:A.jpg',info(true));
 assert.equal(a.author,'Ana & Co');assert.equal(a.license,'CC BY 4.0');assert.equal(a.sourceUrl,'https://commons.wikimedia.org/wiki/File:A.jpg');
 assert.equal(attributionFromImageInfo('File:A.jpg',info(false)),null);
 assert.equal(plainText('<b>x</b>  y'),'x y');
});
test('openverse name matching',()=>{
 assert.equal(fold('Hotel Arenal Kíoro'),'hotel arenal kioro');
 assert.ok(distinctiveName('Hotel Arenal Kioro'));assert.ok(!distinctiveName('Soda'));assert.ok(!distinctiveName('Hotel'));assert.ok(distinctiveName('Manuel Antonio'));
 assert.ok(containsName('Photo of the Hotel Arenal Kíoro lobby','Arenal Kioro'));assert.ok(!containsName('Arenal volcano','Arenal Kioro'));
 const r=(over)=>({id:'1',title:'Hotel Arenal Kioro',url:'https://live.staticflickr.com/a.jpg',foreign_landing_url:'https://www.flickr.com/photos/1',license:'by',license_version:'2.0',tags:[],...over});
 const place={name:'Hotel Arenal Kioro'};
 assert.ok(pickCandidate(place,[r({})]));
 assert.equal(pickCandidate(place,[r({license:'by-nc'})]),null);
 assert.equal(pickCandidate(place,[r({title:'Little flower',tags:[{name:'arenal'}]})]),null);
 assert.equal(pickCandidate({name:'Soda'},[r({title:'Soda'})]),null);
 const withCR=r({id:'2',title:'Hotel Arenal Kioro, Costa Rica'});
 assert.equal(pickCandidate(place,[r({}),withCR]).id,'2');
 const at=attributionFromResult(r({creator:'Ana',source:'flickr',license_url:'https://creativecommons.org/licenses/by/2.0/'}));
 assert.equal(at.license,'CC BY 2.0');assert.equal(at.provider,'Flickr');assert.equal(at.note,NOTE);
});
