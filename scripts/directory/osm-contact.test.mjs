// LOCAL PRO ONLY: node --test scripts/directory/osm-contact.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePhone,phoneFromTags,whatsappFromTags} from './osm-contact.mjs';

test('Costa Rican numbers become +506XXXXXXXX, first value wins',()=>{
 assert.equal(normalizePhone('+506 2519-9151'),'+50625199151');
 assert.equal(normalizePhone('8368 2100'),'+50683682100');
 assert.equal(normalizePhone('(+506) 4070-0330'),'+50640700330');
 assert.equal(normalizePhone('+506 2231 1586; +506 2231 4058'),'+50622311586');
 assert.equal(normalizePhone('(506) 2442-2422'),'+50624422422');
 assert.equal(normalizePhone('800 1234567'),'8001234567');
 assert.equal(normalizePhone('12345'),undefined);
 assert.equal(normalizePhone('+41 79 751 93 43'),'+41797519343');
 assert.equal(normalizePhone('+41 79 751 93 43',{foreign:false}),undefined);
});
test('phone: phone, then contact:phone, then a mobile number',()=>{
 assert.equal(phoneFromTags({phone:'+506 2222 3333',mobile:'8888 7777'}),'+50622223333');
 assert.equal(phoneFromTags({'contact:phone':'2222-3333'}),'+50622223333');
 assert.equal(phoneFromTags({mobile:'+50688155420'}),'+50688155420');
 assert.equal(phoneFromTags({name:'x'}),undefined);
});
test('WhatsApp comes only from real tags, never from a landline',()=>{
 assert.equal(whatsappFromTags({'contact:whatsapp':'+506 6363 4274'}),'+50663634274');
 assert.equal(whatsappFromTags({whatsapp:'8837-3337'}),'+50688373337');
 assert.equal(whatsappFromTags({'contact:whatsapp':'https://wa.me/50688373337?text=hola'}),'+50688373337');
 assert.equal(whatsappFromTags({whatsapp:'yes',phone:'+506 8753 4601'}),'+50687534601');
 assert.equal(whatsappFromTags({whatsapp:'yes',phone:'+506 2222 3333'}),undefined);
 assert.equal(whatsappFromTags({whatsapp:'yes',phone:'+506 2222 3333',mobile:'8888 1111'}),'+50688881111');
 assert.equal(whatsappFromTags({mobile:'+506 8888 1111'}),undefined);
 assert.equal(whatsappFromTags({mobile:'+506 8888 1111 (WhatsApp)'}),'+50688881111');
 assert.equal(whatsappFromTags({whatsapp:'no',mobile:'8888 1111'}),undefined);
 assert.equal(whatsappFromTags({'contact:whatsapp':'+87198350'}),undefined);
 assert.equal(whatsappFromTags({'contact:whatsapp':'+1 971 645 0227'}),'+19716450227');
 assert.equal(whatsappFromTags({phone:'+506 2222 3333'}),undefined);
});
