import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {retainSavedEditorLink} from '../src/lib/editor-sections.js';
import {inputAttributes} from '../src/lib/atelier-fields.js';

const tenantField={name:'tenantId',type:'select',options:[{value:21,label:'Khách hiện tại'}]};

test('V2.80: existing lease shows archived tenant link instead of a misleading blank selector',()=>{
 const result=retainSavedEditorLink(tenantField,'archived-client','archived-client');
 assert.equal(result.options[0].value,'archived-client');
 assert.match(result.options[0].label,/cần đối chiếu/);
 assert.match(result.help,/trước khi lưu/);
 assert.equal(result.options.length,2);
});

test('V2.80: stale reference cannot be added as a newly chosen client',()=>{
 const result=retainSavedEditorLink(tenantField,'archived-client','21');
 assert.strictEqual(result,tenantField);
 assert.ok(!result.options.some(option=>option.value==='archived-client'));
 assert.strictEqual(retainSavedEditorLink(tenantField,'archived-client',''),tenantField);
});

test('V2.80: current valid links and unlinked drafts never gain duplicate or phantom options',()=>{
 assert.strictEqual(retainSavedEditorLink(tenantField,'21','21'),tenantField);
 assert.strictEqual(retainSavedEditorLink(tenantField,null,null),tenantField);
 assert.strictEqual(retainSavedEditorLink(tenantField,'',''),tenantField);
});

test('V2.80: historical record IDs cannot replace unrelated field types or change original options',()=>{
 const text={name:'tenantName',type:'text',options:[]};
 assert.strictEqual(retainSavedEditorLink(text,'client-1','client-1'),text);
 assert.equal(tenantField.options.length,1);
 const result=retainSavedEditorLink(tenantField,'archived-client','archived-client');
 assert.equal(tenantField.options.length,1);
 assert.notStrictEqual(result.options,tenantField.options);
});

test('V2.80: VND fields use integer-friendly mobile keyboard, area and rates allow decimals',()=>{
 assert.equal(inputAttributes({name:'amount',type:'number'}).inputMode,'numeric');
 assert.equal(inputAttributes({name:'paymentDay',type:'number',min:1,max:31}).inputMode,'numeric');
 assert.equal(inputAttributes({name:'bedrooms',type:'number'}).inputMode,'numeric');
 assert.equal(inputAttributes({name:'area',type:'number',step:'any'}).inputMode,'decimal');
 assert.equal(inputAttributes({name:'feePercent',type:'number',step:0.5}).inputMode,'decimal');
 assert.equal(inputAttributes({name:'rent',type:'number',step:1}).inputMode,'numeric');
});

test('V2.80: both unit and lease legacy links are retained only for edits',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/unit:\['ownerId','tenantId','managerId','saleId'\]/);
 assert.match(app,/lease:\['unitId','tenantId'\]/);
 assert.match(app,/record&&\(\{unit:/);
 assert.match(app,/retainSavedEditorLink\(scoped,record\[f.name\],draft\[f.name\]\)/);
});
