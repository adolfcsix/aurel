import test from 'node:test';
import assert from 'node:assert/strict';
import {scoped} from '../src/state-access.js';
import {apiPrivacyHeaders} from '../src/api-privacy.js';

const sample=()=>({
 projects:[{id:'project-1',name:'Project',bankDetails:'PRIVATE PROJECT BANK'}],buildings:[{id:'building-1',projectId:'project-1',serviceContract:'PRIVATE BUILDING CONTRACT'}],floors:[],rooms:[],
 staff:[{id:'staff-a',name:'Employee A',short:'EA',role:'Sale',email:'private@aurel.test',phone:'01234'}],
 clients:[{id:'owner-1',name:'Private Owner',phone:'01234'}],
 units:[{id:'unit-a',code:'A01',projectId:'project-1',buildingId:'building-1',status:'occupied',managerId:'staff-a',ownerId:'owner-1',
  owner:'Private Owner',tenant:'Private Tenant',rent:9000000,deposit:18000000,depositReturned:1000000,feePercent:6,
  interiorNotes:'Password to lockbox',notes:'Bank account 123',accessCode:'secret future field',area:45,revision:2},
  {id:'unit-b',code:'B01',projectId:'project-1',status:'vacant',managerId:'staff-b',owner:'Private Owner 2',rent:12000000}],
 leases:[{id:'lease-a',unitId:'unit-a',status:'active',startsOn:'2026-01-01',endsOn:'2027-01-01',rent:9000000,
  depositExpected:18000000,tenantName:'Tenant A',bankDetails:'secret future lease field'}],
 schedules:[{id:'schedule-a',unitId:'unit-a',leaseId:'lease-a'}],payments:[{id:'payment-a',scheduleId:'schedule-a'}],paymentAttachments:[{id:'evidence-a'}],
 depositTransactions:[{amount:18000000}],depositSettlements:[{refund:9000000}],feeHistory:[{percent:6}],
 reminderContacts:[{scheduleId:'schedule-a'}],reminderNotifications:[{scheduleId:'schedule-a'}],
 users:[{passwordHash:'sensitive'}],sessions:[{csrf:'secret'}],audit:[{before:{passwordHash:'secret'}}],
 preferences:{company:'AUREL',reminderDays:5,defaultFee:6,defaultFeeHistory:[{percent:6}]},
 internalBankAccounts:[{account:'secret account'}]
});
const forRole=role=>({user:{id:role,role,staffId:role==='staff'?'staff-a':null}});

test('V2.6 viewer: explicit allowlist never leaks financial/PII/future fields',()=>{
 const db=sample(),before=structuredClone(db),view=scoped(forRole('viewer'),db);
 assert.equal(view.units.length,2);
 assert.equal(JSON.stringify(view).includes('PRIVATE PROJECT BANK'),false);
 assert.equal(JSON.stringify(view).includes('PRIVATE BUILDING CONTRACT'),false);
 assert.equal(view.units[0].code,'A01');
 assert.equal(view.units[0].area,45);
 assert.equal(view.units[0].rent,null);
 assert.equal(view.units[0].deposit,null);
 assert.equal(view.units[0].depositReturned,null);
 for(const privateKey of ['accessCode','bankDetails','internalBankAccounts','defaultFeeHistory']){
  assert.equal(JSON.stringify(view).includes(privateKey),false,privateKey+' should not appear');
 }
 assert.equal(JSON.stringify(view).includes('Password to lockbox'),false);
 assert.equal(JSON.stringify(view).includes('Bank account 123'),false);
 assert.equal(JSON.stringify(view).includes('Private Tenant'),false);
 assert.equal(JSON.stringify(view).includes('private@aurel.test'),false);
 for(const collection of ['clients','payments','paymentAttachments','depositTransactions','depositSettlements','feeHistory','audit','sessions','users'])assert.deepEqual(view[collection],[]);
 assert.equal(view.preferences.defaultFee,null);
 assert.deepEqual(db,before,'projection must not mutate original database');
});

test('V2.6 staff: only assigned portfolio and its linked contract/payments are returned',()=>{
 const view=scoped(forRole('staff'),sample());
 assert.deepEqual(view.units.map(u=>u.id),['unit-a']);
 assert.deepEqual(view.leases.map(l=>l.id),['lease-a']);
 assert.deepEqual(view.payments.map(p=>p.id),['payment-a']);
 assert.deepEqual(view.clients.map(c=>c.id),['owner-1']);
 assert.deepEqual(view.users,[]);
 assert.deepEqual(view.audit,[]);
 assert.deepEqual(view.depositTransactions,[]);
});

test('V2.6 manager/admin keep full data for authorized workflows',()=>{
 const db=sample();
 assert.strictEqual(scoped(forRole('manager'),db),db);
 assert.strictEqual(scoped(forRole('admin'),db),db);
});

test('V2.6 API privacy headers disable HTTP cache and MIME sniffing before any response',()=>{
 const headers=new Map();let continued=0;
 apiPrivacyHeaders({}, {setHeader:(key,val)=>headers.set(key.toLowerCase(),val)},()=>{continued++});
 assert.equal(continued,1);
 assert.match(headers.get('cache-control'),/no-store/);
 assert.equal(headers.get('pragma'),'no-cache');
 assert.equal(headers.get('x-content-type-options'),'nosniff');
 assert.equal(headers.get('referrer-policy'),'no-referrer');
});

test('V2.6 API privacy middleware is registered before routes including login/state',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.ok(src.indexOf("app.use('/api',apiPrivacyHeaders)")<src.indexOf("app.get('/api/health'"));
 assert.match(src,/import \{scoped,stateResponse,hasAssignedUnit\} from '\.\/state-access\.js'/);
});
