import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoped,stateResponse} from '../src/state-access.js';
import {hasPermission} from '../src/security.js';
import {reminderQueue,depositBalance} from '../src/domain.js';

const customer='CUSTOMER_SECRET_262';
const phone='PHONE_SECRET_262';
const email='EMAIL_SECRET_262';
const owner='OWNER_SECRET_262';
const fixture=()=>({
 projects:[{id:'p',name:'Maison',privateOwner:owner}],
 buildings:[{id:'b',projectId:'p',code:'B',futureClientPhone:phone}],floors:[],rooms:[],
 staff:[{id:'s',name:'Employee',short:'EMP',role:'Sale',email:email,phone}],
 clients:[{id:'c',name:customer,phone,email,passport:phone,notes:owner,extraPrivate:{name:customer}}],
 units:[{id:'u',code:'A-110',projectId:'p',managerId:'s',owner:owner,tenant:customer,ownerId:'c',tenantId:'c',rent:12000000,deposit:24000000,feePercent:6,feeBasis:'due',status:'occupied',phone,email,interiorNotes:phone,notes:owner,accessCode:'SECRET_CODE',futurePrivate:{name:customer}}],
 leases:[{id:'l',unitId:'u',tenantId:'c',tenantName:customer,contactPhone:phone,notes:email,startsOn:'2026-01-01',endsOn:'2027-01-01',status:'active',rent:12000000,depositExpected:24000000,paymentDay:5}],
 schedules:[{id:'s1',unitId:'u',leaseId:'l',period:'2026-11',dueOn:'2026-11-05',amount:12000000,feePercent:6,feeBasis:'due',status:'open',tenantPhone:phone}],
 payments:[{id:'pay',unitId:'u',leaseId:'l',scheduleId:'s1',period:'2026-11',date:'2026-11-05',amount:5000000,status:'posted',method:'Chuyển khoản',reference:'BANK-001',note:phone,futurePrivate:{name:customer}}],
 paymentAttachments:[{id:'a',paymentId:'pay',filename:'receipt.pdf',mime:'application/pdf',sha256:'x',size:50,diskName:'server-private-filename',ownerPhone:phone}],
 depositTransactions:[{id:'d',leaseId:'l',unitId:'u',kind:'receive',amount:24000000,date:'2026-01-01',note:phone}],
 depositSettlements:[{id:'req',leaseId:'l',unitId:'u',status:'pending',refund:24000000,deduction:0,createdBy:'s',note:email}],
 feeHistory:[{id:'f',unitId:'u',percent:6,basis:'due',effectiveFrom:'2026-01-01',reason:phone}],
 reminderContacts:[{id:'rc',unitId:'u',leaseId:'l',scheduleId:'s1',outcome:'called',nextContactOn:'2026-11-10',note:phone}],
 reminderNotifications:[{id:'n',unitId:'u',leaseId:'l',scheduleId:'s1',kind:'due',forDate:'2026-11-04',dueOn:'2026-11-05',amountRemaining:7000000,status:'unread',customerName:customer}],
 users:[{id:'admin',role:'admin',username:'admin',name:'Admin',passwordHash:phone}],sessions:[{id:'ses',csrf:phone}],audit:[{event:phone}],
 preferences:{company:'AUREL',reminderDays:5,defaultFee:6,privateAccount:email},internalBankAccounts:[{phone}]
});
const as=role=>({user:{role,id:'actor-'+role,staffId:role==='staff'?'s':undefined}});
const pubUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role});

// The actual GET /api/state wire-shaped payload is tested, not only scoping in isolation.
test('V2.63: accountant API state never returns customer directory, contact details, or future private fields',()=>{
 const db=fixture(),baseline=structuredClone(db),payload=stateResponse(as('accountant'),db,pubUser);
 assert.deepEqual(payload.clients,[]);
 for(const value of [customer,phone,email,owner,'SECRET_CODE','server-private-filename']){
  assert.equal(JSON.stringify(payload).includes(value),false,`sensitive value: ${value}`);
 }
 for(const field of ['owner','tenant','ownerId','tenantId','interiorNotes','notes','futurePrivate'])assert.equal(Object.hasOwn(payload.units[0],field),false,field);
 for(const field of ['tenantName','tenantId','contactPhone','notes'])assert.equal(Object.hasOwn(payload.leases[0],field),false,field);
 for(const field of ['notes','ownerPhone','diskName','internalBankAccounts'])assert.equal(JSON.stringify(payload).includes('"'+field+'"'),false,field);
 assert.deepEqual(payload.users,[]);assert.deepEqual(payload.audit,[]);
 assert.deepEqual(db,baseline,'no mutation in server projection');
});

test('V2.63: accountant retains strictly necessary ledger data without customer identities',()=>{
 const raw=fixture(),state=stateResponse(as('accountant'),raw,pubUser);
 assert.equal(state.units[0].code,'A-110');assert.equal(state.units[0].rent,12000000);
 assert.equal(state.leases[0].rent,12000000);
 assert.equal(state.schedules[0].amount,12000000);
 assert.equal(state.payments[0].amount,5000000);
 assert.equal(state.payments[0].reference,'BANK-001');
 assert.equal(state.feeHistory[0].percent,6);
 assert.equal(state.depositSettlements[0].refund,24000000);
 assert.equal(depositBalance(state,'l'),24000000);
 assert.equal(reminderQueue(state,'2026-11-02')[0].left,7000000);
 assert.equal(state.paymentAttachments[0].filename,'receipt.pdf');
 assert.equal(state.reminderContacts[0].outcome,'called');
 assert.equal(state.preferences.defaultFee,6);
});

test('V2.63: all five roles have explicit boundaries in the exact API state response',()=>{
 const db=fixture();
 for(const role of ['admin','manager','accountant','staff','viewer']){
  const state=stateResponse(as(role),db,pubUser);
  assert.equal(state.units.length,1,role);
  assert.equal(state.users.some(u=>'passwordHash' in u),false,role);
  assert.equal(JSON.stringify(state).includes('server-private-filename'),false,role);
  assert.equal(state.clients.length,role==='viewer'||role==='accountant'?0:1,role);
  assert.equal(state.payments.length,role==='viewer'?0:1,role);
  assert.equal(state.audit.length,role==='admin'||role==='manager'?1:0,role);
 }
 const v=stateResponse(as('viewer'),db,pubUser);
 assert.equal(v.units[0].rent,null);assert.equal(JSON.stringify(v).includes(customer),false);
 const staff=stateResponse(as('staff'),db,pubUser);
 assert.equal(staff.clients[0].phone,phone,'authorized assigned staff need contact details');
});

test('V2.63: without permission a role cannot obtain client directory or management endpoints',()=>{
 assert.equal(hasPermission({role:'accountant'},'client.read'),false);
 assert.equal(hasPermission({role:'accountant'},'client.write'),false);
 assert.equal(hasPermission({role:'staff'},'client.read'),true);
 assert.equal(hasPermission({role:'viewer'},'client.read'),false);
 for(const role of ['accountant','viewer','staff'])assert.equal(hasPermission({role},'client.write'),false);
 for(const role of [null,undefined,'cashier','ACCOUNTANT'])assert.throws(()=>scoped(as(role),fixture()),e=>e.status===403);
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.match(src,/app\.get\('\/api\/state',async\(req,res\)=>res\.json\(stateResponse\(req,await getDb\(\),pubUser\)\)\)/);
 assert.match(src,/CRUD\('clients','clients','client\.write'/);
 assert.match(src,/app\.get\('\/api\/audit',async\(req,res\)=>\{permit\(req,'audit\.read'\)/);
 assert.match(src,/app\.get\('\/api\/payments\/:id\/attachments',async\(req,res\)=>\{\s*permit\(req,'payment\.write'\)/);
});

test('V2.63: /api/reminders shaped data for accountant never includes private contact note',()=>{
 const state=scoped(as('accountant'),fixture());
 const due=reminderQueue(state,'2026-11-03');
 assert.equal(due.length,1);
 assert.equal(due[0].lastContact.outcome,'called');
 assert.equal(Object.hasOwn(due[0].lastContact,'note'),false);
 assert.equal(JSON.stringify(due).includes(phone),false);
});

test('V2.63: unknown future nested fields remain inaccessible to accountant',()=>{
 const db=fixture();
 for(const [collection,key] of [['projects','private'],['units','futurePii'],['schedules','futurePii'],['payments','futurePii'],['depositSettlements','futurePii'],['depositTransactions','futurePii'],['feeHistory','futurePii'],['paymentAttachments','futurePii'],['reminderNotifications','futurePii']])db[collection][0][key]={phone,clientName:customer};
 const output=stateResponse(as('accountant'),db,pubUser);
 assert.equal(JSON.stringify(output).includes(customer),false);
 assert.equal(JSON.stringify(output).includes(phone),false);
});

test('V2.63: malformed legacy nested values cannot smuggle customer data through allowed fields',()=>{
 const db=fixture();
 db.projects[0].buildings=[{id:'b',privatePhone:phone}];
 db.payments[0].reference={clientPhone:phone};
 db.units[0].rent={clientPhone:phone};
 db.depositTransactions[0].amount={clientPhone:phone};
 db.paymentAttachments[0].filename={clientPhone:phone};
 const state=stateResponse(as('accountant'),db,pubUser);
 assert.equal(JSON.stringify(state).includes(phone),false);
 assert.equal(Object.hasOwn(state.projects[0],'buildings'),false);
 assert.equal(Object.hasOwn(state.payments[0],'reference'),false);
 assert.equal(Object.hasOwn(state.units[0],'rent'),false);
});
