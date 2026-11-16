import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordRoute,enterDossier,leaveDossier,DOSSIER_TRAIL_LIMIT} from '../src/lib/dossier-trail.js';
const read=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');

test('V2.27 only accepts known record types with real IDs',()=>{
 assert.deepEqual(recordRoute('client','c-12'),{kind:'client',id:'c-12'});
 assert.deepEqual(recordRoute('unit',42),{kind:'unit',id:42});
 for(const [type,id] of [['unknown','x'],['client',''],['lease',null],['unit','  ']])assert.equal(recordRoute(type,id),null);
});
test('V2.27 route trail returns to the prior record without guessing a foreign-key link',()=>{
 const unit=recordRoute('unit','u1'),client=recordRoute('client','c1'),lease=recordRoute('lease','l1');
 const first=enterDossier([],unit,client),second=enterDossier(first,client,lease);
 assert.deepEqual(second,[unit,client]);
 const back=leaveDossier(second);assert.deepEqual(back.previous,client);assert.deepEqual(back.trail,[unit]);
 assert.deepEqual(leaveDossier(back.trail),{previous:unit,trail:[]});
 assert.deepEqual(leaveDossier([]),{previous:null,trail:[]});
});
test('V2.27 trail is bounded, same-record navigation does not grow, direct navigation clears',()=>{
 let trail=[];let current=recordRoute('unit','u0');
 for(let i=1;i<30;i++){
  const next=recordRoute('unit','u'+i);trail=enterDossier(trail,current,next);current=next;
 }
 assert.equal(trail.length,DOSSIER_TRAIL_LIMIT);
 assert.deepEqual(enterDossier(trail,current,current),trail);
 assert.deepEqual(enterDossier(trail,null,recordRoute('lease','l1')),[]);
});
test('V2.27 app wires reversible dossier history and retained unit tab state',()=>{
 const app=read('App.jsx');
 for(const part of ["import {recordRoute,enterDossier,leaveDossier}","[dossierTrail,setDossierTrail]","[unitDossierTab,setUnitDossierTab]","const backDossier=()=>","const closeDossier=()=>","onBack={dossierTrail.length?backDossier:undefined}","initialTab={unitDossierTab}","onTabChange={setUnitDossierTab}"])assert.ok(app.includes(part),part);
 assert.equal((app.match(/onBack=\{dossierTrail.length\?backDossier:undefined\}/g)||[]).length,5);
});
test('V2.27 all four specialized dossiers expose navigation for their real sections',()=>{
 const parts={ClientDossier:['contact','properties','matching'],LeaseDossier:['terms','schedules','deposits'],ProjectDossier:['location','buildings','units'],StaffDossier:['profile','responsibility']};
 for(const [f,ids] of Object.entries(parts)){
  const source=read('components/'+f+'.jsx');
  for(const k of ids)assert.match(source,new RegExp('sectionKey="'+k+'"'));
  assert.match(source,/onBack=\{onBack\}/);
  assert.doesNotMatch(source,/sectionKey="[^"]+"\s+sectionKey=/);
 }
 assert.match(read('components/LeaseDossier.jsx'),/sections=\{showFinancial\?/);
});
test('V2.27 section controls are real buttons, do not present inaccessible financial sections',()=>{
 const frame=read('components/DossierFrame.jsx');
 assert.match(frame,/aria-label="Chuyển nhanh trong hồ sơ"/);
 assert.match(frame,/type="button" onClick=\{\(\)=>jumpTo\(key\)\}/);
 assert.match(frame,/target\.querySelector\('h3'\)\?\.focus/);
 assert.match(frame,/prefers-reduced-motion: reduce/);
 assert.match(read('components/LeaseDossier.jsx'),/showFinancial&&/);
 assert.match(read('components/PropertyDossier.jsx'),/!showFinancial&&\['finance','history'\]\.includes\(initialTab\)/);
});
test('V2.27 visual layer keeps 14px buttons, keyboard focus and reduced motion without decorative financial blur',()=>{
 const css=read('atelier-v227.css');
 for(const p of [/border-radius:14px/,/focus-visible/,/prefers-reduced-motion:reduce/,/max-width:380px/,/\.aurel-dossier-back/,/\.aurel-dossier-contents/])assert.match(css,p);
 assert.doesNotMatch(css,/backdrop-filter|filter:\s*blur|animation:\s*infinite/i);
 const main=read('main.jsx');assert.match(main,/import '\.\/atelier-v226\.css';\s*import '\.\/atelier-v227\.css';/);
});
test('V2.27 no new backend routes, identities derived from names, or file upload claims',()=>{
 const trail=read('lib/dossier-trail.js');assert.doesNotMatch(trail,/fetch\(|api\(|localStorage|tenantName|\.name\s*===/);
 const lease=read('components/LeaseDossier.jsx');assert.match(lease,/Tên ghi trên hợp đồng được giữ nguyên để đối chiếu/);
});
