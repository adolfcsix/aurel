import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopedUnitLocationField,changeUnitLocationDraft} from '../src/lib/editor-sections.js';
import {nearestOutstandingSchedule} from '../src/lib/finance.js';
import {clientOptionsForRole} from '../src/lib/client-profile.js';
import {validateClientLink} from '../../backend/src/client-validation.js';
import {cleanUnit} from '../../backend/src/unit-validation.js';
import {upgrade} from '../../backend/src/store.js';
import {seed} from '../../backend/src/seed.js';

const fixtures={
 buildings:[{id:11,projectId:1,code:'A'},{id:12,projectId:2,code:'B'}],
 floors:[{id:21,buildingId:11,projectId:1,code:'02'},{id:22,buildingId:12,projectId:2,code:'06'}],
 rooms:[{id:31,floorId:21,buildingId:11,code:'201'},{id:32,floorId:22,buildingId:12,code:'602'}]
};
const field=(name,rows)=>({name,options:rows.map(item=>({value:item.id,label:item.code}))});

test('V2.79 legacy apartment shows its saved building even if project selection is inconsistent',()=>{
 const result=scopedUnitLocationField(field('buildingId',fixtures.buildings),fixtures,{projectId:1,buildingId:'12'});
 assert.equal(result.options.find(x=>String(x.value)==='12')?.label,'B — cần đối chiếu vị trí');
 assert.match(result.help,/Liên kết đang lưu/);
 assert.ok(result.options.find(x=>String(x.value)==='11'),'valid project building must remain selectable');
});
test('V2.79 legacy floor without current catalog row remains visibly selected',()=>{
 const result=scopedUnitLocationField(field('floorId',fixtures.floors),fixtures,{buildingId:11,floorId:'archived-floor'});
 assert.ok(result.options.some(x=>x.value==='archived-floor'&&x.label.includes('không còn trong danh mục')));
});
test('V2.79 valid child selection has no legacy warning or duplicate options',()=>{
 const result=scopedUnitLocationField(field('roomId',fixtures.rooms),fixtures,{floorId:21,roomId:'31'});
 assert.deepEqual(result.options.map(x=>x.value),[31]);
 assert.equal(result.help,undefined);
});
test('V2.79 changing parent clears retained legacy selections instead of carrying invalid links',()=>{
 const before={projectId:1,buildingId:'12',floorId:'archived-floor',roomId:32,building:'B',floor:'06',room:'602'};
 const next=changeUnitLocationDraft(before,'projectId','2',fixtures);
 assert.deepEqual([next.buildingId,next.floorId,next.roomId],['','','']);
 assert.equal(before.buildingId,'12');
});
test('V2.79 a decimal area is accepted by business logic and HTML form step must permit it',()=>{
 const db=upgrade(seed());
 const result=cleanUnit({code:'V279-DECIMAL',area:52.5},db,{status:'draft',feeBasis:'due',code:''});
 assert.equal(result.area,52.5);
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/name:'area',label:'Diện tích \(m²\)',type:'number',min:0,step:'any'/);
});
test('V2.79 nearest due skips missing dates, finished and fully paid cycles',()=>{
 const data={payments:[{scheduleId:'paid',amount:100,status:'posted'}]};
 const schedules=[
  {id:'unknown',status:'open',dueOn:'',amount:200},
  {id:'cancelled',status:'cancelled',dueOn:'2026-01-01',amount:100},
  {id:'paid',status:'open',dueOn:'2026-01-02',amount:100},
  {id:'later',status:'open',dueOn:'2026-11-20',amount:100},
  {id:'earlier',status:'open',dueOn:'2026-11-18',amount:100}
 ];
 assert.equal(nearestOutstandingSchedule(data,schedules)?.id,'earlier');
 assert.equal(nearestOutstandingSchedule(data,schedules.slice(0,3)),null);
});
test('V2.79 financial next-due callout uses the same checked schedule selection',()=>{
 const source=readFileSync(new URL('../src/components/PropertyDossier.jsx',import.meta.url),'utf8');
 assert.match(source,/nextDue=access\.financial\?nearestOutstandingSchedule\(data,schedules\):null/);
 assert.match(source, /\{nextDue&&/);
});

test('V2.79 lease tenant selector excludes archived clients and owner-only dossiers before submit',()=>{
 const clients=[{id:'owner',type:'owner',name:'Chủ riêng'},{id:'tenant',type:'tenant',name:'Khách thuê',code:'T-01'},
  {id:'both',type:'both',name:'Song vai trò'},{id:'old',type:'tenant',status:'archived',name:'Hồ sơ đã lưu trữ'},
  {id:'legacy',name:'Hồ sơ chưa phân loại'}];
 const options=clientOptionsForRole(clients,'tenant');
 assert.deepEqual(options.map(x=>x.value),['tenant','both','legacy']);
 assert.match(options[0].label,/Khách thuê · T-01/);
 assert.throws(()=>validateClientLink(clients[0],'tenant'),/không có vai trò khách thuê/);
 assert.throws(()=>validateClientLink(clients[3],'tenant'),/đã được lưu trữ/);
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/name:'tenantId',label:'Liên kết hồ sơ khách thuê',type:'select',options:clientOptionsForRole\(data.clients,'tenant'\)/);
});
