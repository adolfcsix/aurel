import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupEditorFields} from '../src/lib/editor-sections.js';

test('V1.6: apartment form groups do not duplicate or drop schema fields',()=>{
 const names=['code','projectId','buildingId','building','floor','room','address','area','bedrooms','status','ownerId','owner','tenantId','tenant','managerId','saleId','rent','renewalRent','feePercent','feeBasis','deposit','leaseStart','leaseEnd','paymentDay','notes','feeEffectiveFrom','feeReason'];
 const groups=groupEditorFields('unit',names.map(name=>({name,label:name})));
 assert.deepEqual(new Set(groups.flatMap(g=>g.fields.map(f=>f.name))),new Set(names));
 assert.equal(groups.flatMap(g=>g.fields).length,names.length);
 assert.ok(groups.every(g=>g.title&&g.note));
 assert.equal(groupEditorFields('payment',names.map(name=>({name}))),null);
});
test('V1.6: contractual and personnel forms are also grouped',()=>{
 const fields=['unitId','tenantName','status','startsOn','endsOn','paymentDay','rent','depositExpected','notes'].map(name=>({name}));
 const groups=groupEditorFields('lease',fields);
 assert.equal(groups.reduce((n,g)=>n+g.fields.length,0),fields.length);
 assert.match(groups.map(g=>g.title).join(';'),/Giá thuê/);
});
test('V1.6: React editor presents optional data sections with accessible focus',()=>{
 const src=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/atelier-forms.css',import.meta.url),'utf8');
 assert.match(src,/groupEditorFields\(kind,fields\)/);
 assert.match(src,/atelier-editor-section/);
 assert.match(css,/\.atelier-editor \.field-input:focus-visible/);
 assert.match(css,/@media\(max-width:760px\)/);
});
