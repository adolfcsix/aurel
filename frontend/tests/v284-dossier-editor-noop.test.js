import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasEditorChanges,dossierEditKinds} from '../src/lib/editor-diff.js';
const fields=[{name:'name'},{name:'phone'},{name:'rent',type:'number'},{name:'ownerId',type:'select'}];
const client={id:'c1',name:'Lan',phone:'',rent:null,ownerId:7,revision:3};

test('V2.84: untouched dossiers cannot create spurious saves, audit rows or revisions',()=>{
 for(const kind of ['client','unit','lease','project','building','floor','room','staff']){
  assert.equal(hasEditorChanges(kind,{...client},client,fields),false,kind);
 }
 assert.ok(dossierEditKinds.has('lease'));
});

test('V2.84: changing a value then reverting restores clean state',()=>{
 const draft={...client,phone:'123'};
 assert.equal(hasEditorChanges('client',draft,client,fields),true);
 draft.phone='';
 assert.equal(hasEditorChanges('client',draft,client,fields),false);
});

test('V2.84: equivalent number / select types and blank optional entries are not real edits',()=>{
 assert.equal(hasEditorChanges('unit',{...client,rent:'',ownerId:'7'},client,fields),false);
 assert.equal(hasEditorChanges('unit',{...client,rent:'0'},client,fields),true);
 assert.equal(hasEditorChanges('unit',{...client,rent:'52.500',ownerId:'7'},{...client,rent:52.5},fields),false);
 assert.equal(hasEditorChanges('unit',{...client,rent:'52.75'}, {...client,rent:52.5},fields),true);
 assert.equal(hasEditorChanges('client',{...client,phone:'  '},client,fields),false);
});

test('V2.84: metadata and fee audit adjuncts cannot falsely count as a dossier edit',()=>{
 const unitFields=[...fields,{name:'feeEffectiveFrom',type:'date'},{name:'feeReason',type:'textarea'}];
 assert.equal(hasEditorChanges('unit',{...client,revision:9,feeEffectiveFrom:'2026-12-01',feeReason:'policy'},client,unitFields),false);
 assert.equal(hasEditorChanges('unit',{...client,phone:'new'},client,unitFields),true);
});

test('V2.84: new draft records and non-dossier transaction forms retain their own submission flow',()=>{
 assert.equal(hasEditorChanges('client',{},null,fields),true);
 assert.equal(hasEditorChanges('payment',{},client,fields),true);
 assert.equal(hasEditorChanges('fee',{},client,fields),true);
});

test('V2.84: editor uses actual diff for close confirmation and disables no-op submit',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/const changesPending=trackedDossier\?hasEditorChanges\(kind,draft,record,fields\):hasEdits/);
 assert.match(app,/if\(changesPending\)\{setDiscardPrompt\(true\)/);
 assert.match(app,/trackedDossier&&!changesPending\)\)return/);
 assert.match(app,/disabled=\{conflict\|\|unverified\|\|\(trackedDossier&&!changesPending\)/);
 assert.match(app,/Chưa có thay đổi để lưu/);
});
