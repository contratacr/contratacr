import test from 'node:test';
import assert from 'node:assert/strict';
import {cuisinesFromTag,filterPatch} from './osm-filter-attributes.mjs';

test('cuisines: OSM values map to Spanish slugs, synonyms merge, coffee shops and unknown values drop',()=>{
 assert.deepEqual(cuisinesFromTag('pizza;italian_pizza;tex-mex'),['pizza','mexicana']);
 assert.deepEqual(cuisinesFromTag('coffee_shop;juice;xyz'),[]);
 assert.deepEqual(cuisinesFromTag(undefined),[]);
});
test('restaurants: cuisines and soda fill only empty keys',()=>{
 assert.deepEqual(filterPatch({vertical_id:'restaurant',name:'Soda Doña Ana',attributes:{}},{cuisine:'regional'}),{cuisines:['comida-tipica'],soda:true});
 assert.deepEqual(filterPatch({vertical_id:'restaurant',name:'Sodapop Bar',attributes:{}}),{});
 assert.deepEqual(filterPatch({vertical_id:'restaurant',name:'Soda X',attributes:{soda:true,cuisines:['pizza']}},{cuisine:'chinese'}),{});
});
test('brands and chains: OSM brand, operator or name; generic names are no brand; Maxi Palí before Palí',()=>{
 assert.deepEqual(filterPatch({vertical_id:'banking',name:'Cajero automático',attributes:{kind:'atm'}},{operator:'B.C.R.'}),{brand:'BCR'});
 assert.deepEqual(filterPatch({vertical_id:'banking',name:'Banco Nacioanl Liberia',attributes:{}}),{brand:'Banco Nacional'});
 assert.deepEqual(filterPatch({vertical_id:'fuel',name:'Servicentro El Cruce',attributes:{}}),{});
 assert.deepEqual(filterPatch({vertical_id:'fuel',name:'Estación de servicio',attributes:{}},{brand:'Petrolera Delta'}),{brand:'Delta'});
 assert.deepEqual(filterPatch({vertical_id:'grocery',name:'Maxi Palí Heredia',attributes:{}}),{chain:'Maxi Palí'});
 assert.deepEqual(filterPatch({vertical_id:'grocery',name:'Palí Barva',attributes:{}},{operator:'Walmart Centroamérica'}),{chain:'Palí'});
});
test('CCSS and MEP: public operators only',()=>{
 assert.deepEqual(filterPatch({vertical_id:'health',name:'EBAIS Barrio Nuevo',attributes:{kind:'clinic'}}),{publicService:true});
 assert.deepEqual(filterPatch({vertical_id:'education',name:'Escuela Central',attributes:{kind:'school'}},{operator:'MEP'}),{publicService:true});
 assert.deepEqual(filterPatch({vertical_id:'education',name:'Sede UCR',attributes:{kind:'university'}},{operator:'UCR','operator:type':'public'}),{});
});
test('cabinas: named cabinas become kind cabins; hotels, motels and campings named so keep their kind',()=>{
 assert.deepEqual(filterPatch({vertical_id:'lodging',name:'Cabinas Vicky',attributes:{kind:'hostel'}}),{kind:'cabins'});
 assert.deepEqual(filterPatch({vertical_id:'lodging',name:'Hotel y Cabinas Mar',attributes:{kind:'hotel'}}),{});
 assert.deepEqual(filterPatch({vertical_id:'lodging',name:'Cabinas del Poás',attributes:{kind:'motel'}}),{});
 assert.deepEqual(filterPatch({vertical_id:'lodging',name:'Cabinas Wray',attributes:{kind:'cabins'}}),{});
});
