import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ownerProposalDraftValue,reviewOwnerProposalDraft,editableOwnerFields} from '../src/lib/owner-proposal-ux.js';
import {verifyOwnerLink,submitOwnerChange} from '../../backend/src/ownership.js';
import {createSessionBoundary} from '../src/lib/session-boundary.js';

const unit={id:10,code:'T-10',status:'vacant',ownerId:7,address:'Địa chỉ cũ',area:72.5,bedrooms:2,interiorStatus:'partial',feeBasis:'due'};
const makeDb=()=>({users:[{id:'owner',name:'Chủ sở hữu',role:'viewer',status:'active'}],clients:[{id:7,name:'Chủ sở hữu',type:'owner',status:'active'}],units:[{...unit}],projects:[],buildings:[],floors:[],rooms:[],staff:[],leases:[],schedules:[],payments:[],audit:[]});
const review=(field,value,reason='Thông số đã đối chiếu trực tiếp')=>reviewOwnerProposalDraft(unit,field,value,reason);
const source=readFileSync(new URL('../src/components/OwnerChangeRequests.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');

test('V2.83: owner drafts survive background refresh even when the server record changes',()=>{
 assert.equal(ownerProposalDraftValue('Địa chỉ từ server','Địa chỉ tôi đang nhập',true),'Địa chỉ tôi đang nhập');
 assert.equal(ownerProposalDraftValue('Địa chỉ từ server','Bản nháp cũ',false),'Địa chỉ từ server');
 assert.equal(ownerProposalDraftValue(null,'',false),'');
 assert.equal(ownerProposalDraftValue(0,'',false),0);
 assert.match(source,/valueTouched\.current=true;setValue\(e\.target\.value\)/);
 assert.match(source,/ownerProposalDraftValue\(unit\[field\],current,valueTouched\.current\)/);
 assert.match(source,/const changeField=next=>\{valueTouched\.current=false/);
});

test('V2.83: owner can propose precise decimals; integer bedroom guard matches backend',()=>{
 assert.equal(review('area','73.75').valid,true);
 assert.equal(review('area','72.5').valid,false);
 assert.equal(review('bedrooms','3').valid,true);
 for(const bad of ['1.2','NaN','-1','10001'])assert.equal(review('bedrooms',bad).valid,false,bad);
 assert.equal(review('area','abc').valid,false);
 assert.equal(review('area','-1').valid,false);
 assert.equal(review('area','10001').valid,false);
 assert.equal(review('area','').valid,true); // Clearing a populated optional field is supported.
});

test('V2.83: proposal review excludes every finance/admin field and rejects bad text',()=>{
 assert.deepEqual([...editableOwnerFields].sort(),['address','area','bedrooms','interiorStatus'].sort());
 for(const bad of ['rent','deposit','feePercent','ownerId','managerId','notes','interiorNotes','__proto__']){
  assert.equal(review(bad,'anything').valid,false,bad);
 }
 assert.equal(review('address','  Địa chỉ mới ').value,'Địa chỉ mới');
 assert.equal(review('address','  Địa chỉ cũ ').valid,false);
 assert.equal(review('address','Z'.repeat(301)).valid,false);
 assert.equal(review('address','Mới',' ').valid,false);
 assert.equal(review('address','Mới','X'.repeat(801)).valid,false);
 assert.equal(review('interiorStatus','unknown').valid,false);
 assert.equal(review('interiorStatus','furnished').valid,true);
});

test('V2.83: valid proposed values are accepted by actual backend without directly updating the unit',()=>{
 for(const [field,value] of [['address',' Địa chỉ mới '],['area','73.75'],['bedrooms','3'],['interiorStatus','furnished'],['area','']]){
  const db=makeDb();verifyOwnerLink(db,'owner',7,{id:'adm',role:'admin'});
  const checked=review(field,value);
  assert.equal(checked.valid,true,field);
  const row=submitOwnerChange(db,'owner',10,{field,value:checked.value,reason:checked.reason});
  assert.equal(row.status,'pending');
  assert.equal(db.units[0][field],unit[field],field);
 }
});

test('V2.83: request submission handles confirmed POST plus refresh failure without duplicate requests',()=>{
 assert.match(source,/accepted=true;setSubmitted\(true\)/);
 assert.match(source,/const refreshed=await onSaved\(\)/);
 assert.match(source,/if\(refreshed===false\)/);
 assert.match(source,/không gửi lặp/);
 assert.match(source,/error\.uncertain/);
 assert.match(source,/busyRef\.current\|\|pending\|\|submitted/);
 assert.match(source,/disabled=\{!canSubmit\|\|busy\|\|!reviewed\.valid\}/);
 assert.match(app,/setOwnedError\(''\);return true/);
 assert.match(app,/setOwnedError\(e\.message\);return false/);
});

test('V2.83: manager review is fenced against stale refreshes and cannot re-submit acknowledged decisions',()=>{
 assert.match(source,/requestFence=useRef\(createSessionBoundary\(\)\)/);
 assert.match(source,/const ticket=requestFence\.current\.invalidate\(\)/);
 assert.match(source,/!mounted\.current\|\|!requestFence\.current\.matches\(ticket\)/);
 assert.match(source,/return\(\)=>\{mounted\.current=false;requestFence\.current\.invalidate\(\)\}/);
 assert.match(source,/setRequests\(rows=>rows\.filter\(row=>row\.id!==request\.id\)\)/);
 assert.match(source,/const refreshed=await refresh\(\)/);
 assert.match(source,/const synchronized=await onChanged\(\)/);
 assert.match(source,/actionBusy\.current/);
 assert.match(source,/if\(e\.uncertain\)\{setReview\(null\);setUnverified/);
 assert.match(source,/setRequests\(rows\);setUnverified\(\[\]\)/);
});

test('V2.83: newest manager list wins under out-of-order async responses',async()=>{
 const gate=createSessionBoundary(),old=gate.invalidate();
 let rows=[];
 const previous=new Promise(resolve=>setImmediate(resolve)).then(()=>{if(gate.matches(old))rows=['old']});
 const next=gate.invalidate();
 if(gate.matches(next))rows=['new'];
 await previous;
 assert.deepEqual(rows,['new']);
 gate.invalidate();assert.equal(gate.matches(next),false);
});

test('V2.83: owner viewer never gains finance, staff or admin actions through proposal UI',()=>{
 for(const forbidden of ['rent:','deposit:','feePercent:','ownerId:','password:'])assert.equal(source.includes(forbidden),false);
 assert.match(source,/Đang lưu trong hồ sơ:/);
 assert.match(source,/inputMode=\{field==='area'\?'decimal':field==='bedrooms'\?'numeric':'text'\}/);
 assert.match(source,/loading&&<p role="status">Đang cập nhật danh sách đề nghị/);
 assert.match(source,/disabled=\{!canSubmit\|\|!!busy\|\|loading\|\|unverified\.includes\(request\.id\)\}/);
});
