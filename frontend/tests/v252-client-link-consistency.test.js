import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unitPartyName,clientOptionsForRole} from '../src/lib/client-profile.js';
import {filterPortfolioUnits} from '../src/lib/portfolio-hierarchy.js';
import {buildQuickFindIndex} from '../src/lib/quick-find.js';
import {exportUnitCatalogCSV} from '../src/lib/unit-export.js';

const owner={id:'07',name:'Chủ đã xác minh',type:'owner',code:'O07',status:'active'};
const tenant={id:8,name:'Khách thuê đang dùng',type:'tenant',code:'T08',status:'active'};
const both={id:'BOTH',name:'Khách song vai trò',type:'both',status:'active'};
const data={projects:[{id:'p1',name:'Dự án A'}],buildings:[],clients:[owner,tenant,both],
 units:[{id:'u1',code:'A-01',projectId:'p1',ownerId:'07',owner:'Tên cũ không còn chính xác',tenantId:'8',tenant:'Tên khách cũ',status:'draft'}],leases:[]};

test('V2.52 linked profile name outranks stale manual name, without mutating the unit record',()=>{
 const snapshot=JSON.stringify(data.units[0]);
 assert.equal(unitPartyName(data,data.units[0],'owner'),'Chủ đã xác minh');
 assert.equal(unitPartyName(data,data.units[0],'tenant'),'Khách thuê đang dùng');
 assert.equal(JSON.stringify(data.units[0]),snapshot);
});

test('V2.52 preserves leading-zero identity and legacy free-text fallback',()=>{
 assert.equal(unitPartyName({clients:[{...owner,id:7}]},data.units[0],'owner'),'Tên cũ không còn chính xác');
 assert.equal(unitPartyName({clients:[]},{ownerId:'missing',owner:'Tên ghi tay'},'owner'),'Tên ghi tay');
 assert.equal(unitPartyName({}, {owner:'Tên ghi tay'},'invalid'),'');
});

test('V2.52 client options include only compatible active role plus both or legacy role',()=>{
 const clients=[...data.clients,{id:'legacy',name:'Chưa phân loại'}, {id:'dead',name:'Đã lưu trữ',type:'owner',status:'archived'}];
 assert.deepEqual(clientOptionsForRole(clients,'owner').map(o=>o.value),['07','BOTH','legacy']);
 assert.deepEqual(clientOptionsForRole(clients,'tenant').map(o=>o.value),[8,'BOTH','legacy']);
 assert.deepEqual(clientOptionsForRole(clients,'foo'),[]);
});

test('V2.52 searching private linked names uses current client profile only with explicit permission flag',()=>{
 assert.equal(filterPortfolioUnits(data,{search:'chủ đã xác minh',includeNames:true}).length,1);
 assert.equal(filterPortfolioUnits(data,{search:'chủ đã xác minh',includeNames:false}).length,0);
 assert.equal(filterPortfolioUnits(data,{search:'tên cũ',includeNames:true}).length,0);
 assert.equal(filterPortfolioUnits(data,{search:'A-01',includeNames:false}).length,1);
});

test('V2.52 quick find indexes linked names for authorized roles, never viewer',()=>{
 const manager=buildQuickFindIndex(data,{role:'manager'});
 const viewer=buildQuickFindIndex(data,{role:'viewer'});
 assert.ok(manager.find(x=>x.kind==='unit').searchText.includes('Chủ đã xác minh'));
 assert.ok(!viewer.find(x=>x.kind==='unit').searchText.includes('Chủ đã xác minh'));
 assert.ok(!viewer.find(x=>x.kind==='unit').searchText.includes('Tên cũ'));
});

test('V2.52 private export resolves linked identities; public export excludes all client names',()=>{
 const privateCsv=exportUnitCatalogCSV(data.units,data.projects,{includePrivate:true,clients:data.clients});
 const publicCsv=exportUnitCatalogCSV(data.units,data.projects,{includePrivate:false,clients:data.clients});
 assert.match(privateCsv,/Chủ đã xác minh/);
 assert.match(privateCsv,/Khách thuê đang dùng/);
 assert.doesNotMatch(privateCsv,/Tên cũ không còn chính xác|Tên khách cũ/);
 assert.doesNotMatch(publicCsv,/Chủ đã xác minh|Khách thuê đang dùng|Tên cũ|Tên khách cũ|Chủ sở hữu|Khách thuê/);
});

test('V2.52 export neutralizes spreadsheet formulas even in linked profile names',()=>{
 const bad={clients:[{id:'X',name:'=1+1',type:'owner'}]};
 const csv=exportUnitCatalogCSV([{id:'u2',ownerId:'X',owner:'old'}],[],{includePrivate:true,clients:bad.clients});
 assert.match(csv,/"'=1\+1"/);
});

test('V2.52 all unit surfaces reuse same resolver, not duplicated fallback logic',()=>{
 const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
 const app=source('App.jsx');
 const dossier=source('components/PropertyDossier.jsx');
 const mobile=source('components/MobileRecords.jsx');
 const index=source('lib/portfolio-hierarchy.js');
 const find=source('lib/quick-find.js');
 const exportCode=source('lib/unit-export.js');
 for(const module of [app,dossier,mobile,index,find,exportCode])assert.match(module,/unitPartyName\(/);
 assert.match(app,/clientOptionsForRole\(data\.clients,'owner'\)/);
 assert.match(app,/clientOptionsForRole\(data\.clients,'tenant'\)/);
 assert.match(dossier,/access\.clientNames&&<>/);
 assert.match(mobile,/showFinancial&&<><Meta label="Chủ sở hữu">\{unitPartyName/);
 assert.match(exportCode,/includePrivate\?/);
});

test('V2.52 apartment form requires integer bedroom count while keeping zero and empty drafts',async()=>{
 const {cleanUnit}=await import('../../backend/src/unit-validation.js');
 const {seed}=await import('../../backend/src/seed.js');
 const {upgrade}=await import('../../backend/src/store.js');
 const db=upgrade(seed());
 const base={status:'draft',feeBasis:'due',code:''};
 assert.equal(cleanUnit({bedrooms:0},db,base).bedrooms,0);
 assert.equal(cleanUnit({bedrooms:''},db,base).bedrooms,null);
 assert.throws(()=>cleanUnit({bedrooms:1.5},db,base),/Số phòng ngủ phải là số nguyên/);
 assert.equal(cleanUnit({area:65.5},db,base).area,65.5,'Fractional m² must remain permitted');
});
