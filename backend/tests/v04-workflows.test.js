import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {parseCSV,prepareUnitImport,applyUnitImport} from '../src/import-units.js';
import {submitDepositProposal,approveDepositProposal,rejectDepositProposal,executeDepositProposal} from '../src/deposit-approvals.js';
import {queueDailyInternalReminders} from '../src/reminder-jobs.js';
import {depositBalance} from '../src/domain.js';
import {hasPermission} from '../src/security.js';
const sample=()=>upgrade(seed());
const a={id:'staff-a',name:'Người lập'},m={id:'manager-b',name:'Trưởng bộ phận'},c={id:'accountant-c',name:'Kế toán'};

test('CSV parser supports Vietnamese headers, quoting, BOM, semicolon and exact rows',()=>{
 const data='\uFEFFMã căn;Dự án;Giá thuê;Phí QL căn hộ;Ghi chú\r\nNEW-01;Rose Town;"13.000.000";"3,7%";"Gần trường; tầng cao"\r\n';
 const rows=parseCSV(data);assert.equal(rows.length,1);assert.equal(rows[0].record.code,'NEW-01');assert.equal(rows[0].record.rent,'13.000.000');assert.equal(rows[0].record.notes,'Gần trường; tầng cao');
 const db=sample();const report=prepareUnitImport(db,data);assert.equal(report.errors.length,0);assert.equal(report.valid,1);assert.equal(report.prepared[0].rent,13000000);assert.equal(report.prepared[0].feePercent,3.7);
});

test('Preview is read-only; import skips DB duplicates and creates drafts without rent schedules',()=>{
 const db=sample(),units=db.units.length,schedules=db.schedules.length,fees=db.feeHistory.length;
 const csv='Mã căn,Dự án,Tòa nhà,Giá thuê,Phí quản lý\nDV02-2104,Rose Town,DV02,9500000,6\nNEW-B,Rose Town,DV02,14000000,3.7';
 const report=prepareUnitImport(db,csv);assert.equal(report.duplicates,1);assert.equal(report.valid,1);assert.equal(db.units.length,units);
 assert.deepEqual(applyUnitImport(db,csv,a),{imported:1,skipped:1});assert.equal(db.units.length,units+1);assert.equal(db.schedules.length,schedules);assert.equal(db.feeHistory.length,fees+1);
 const created=db.units.find(u=>u.code==='NEW-B');assert.equal(created.status,'draft');assert.equal(created.rent,14000000);
});

test('Import rejects non-existing projects and internal duplicate rows atomically',()=>{
 const db=sample(),units=db.units.length;
 const csv='Mã căn,Dự án,Giá thuê\nA,Bất động sản chưa tạo,10000\nA,Bất động sản chưa tạo,10000';
 const report=prepareUnitImport(db,csv);assert.equal(report.errors.length,2);
 assert.throws(()=>applyUnitImport(db,csv,a),/Không thể nhập/);assert.equal(db.units.length,units);
});

test('Reject malformed money and ratio instead of partially importing',()=>{
 const db=sample();const csv='Mã căn,Dự án,Giá thuê,Phí quản lý\nX-1,Rose Town,1.200.000,6\nX-2,Rose Town,1.2.3,100.5';
 const report=prepareUnitImport(db,csv);assert.equal(report.valid,1);assert.equal(report.errors.length,1);assert.throws(()=>applyUnitImport(db,csv,a));
});

test('Deposit proposal is separate from settlement and cannot be self-approved',()=>{
 const db=sample(),lease=db.leases.find(l=>l.unitId==='u2');lease.status='ended';const held=depositBalance(db,lease.id);
 const p=submitDepositProposal(db,lease.id,{refund:17000000,deduction:2000000,note:'Đối trừ công nợ có biên bản'},a);
 assert.equal(p.status,'pending');assert.equal(depositBalance(db,lease.id),held);
 assert.throws(()=>approveDepositProposal(db,p.id,a),/không được tự duyệt/i);
 approveDepositProposal(db,p.id,m);assert.equal(p.status,'approved');assert.equal(depositBalance(db,lease.id),held);
 const transaction=executeDepositProposal(db,p.id,c,{reference:'BANK-001'});assert.equal(transaction.refund,17000000);assert.equal(depositBalance(db,lease.id),0);
 assert.equal(executeDepositProposal(db,p.id,c).id,transaction.id);assert.equal(db.depositTransactions.filter(t=>t.proposalId===p.id).length,1);
});

test('Deposit request prevents double-open proposals, excessive refunds, and same proposer execution',()=>{
 const db=sample(),lease=db.leases.find(l=>l.unitId==='u2');lease.status='ended';
 assert.throws(()=>submitDepositProposal(db,lease.id,{refund:20000000,deduction:0},a),/không hợp lệ/);
 const p=submitDepositProposal(db,lease.id,{refund:15000000,deduction:0},a);
 assert.throws(()=>submitDepositProposal(db,lease.id,{refund:15000000,deduction:0},a),/Đang có đề nghị/);
 approveDepositProposal(db,p.id,m);assert.throws(()=>executeDepositProposal(db,p.id,a),/không được tự xác nhận/);
});

test('Rejected proposal remains traceable and permits later request',()=>{
 const db=sample(),lease=db.leases.find(l=>l.unitId==='u2');lease.status='ended';
 const p=submitDepositProposal(db,lease.id,{refund:12000000,deduction:0},a);
 rejectDepositProposal(db,p.id,m,'Chưa có chữ ký bàn giao');assert.equal(p.status,'rejected');
 assert.equal(submitDepositProposal(db,lease.id,{refund:11000000,deduction:0},a).status,'pending');
});

test('Daily reminders are internal, idempotent, and never record fake payment',()=>{
 const db=sample(),before=db.payments.length;
 const first=queueDailyInternalReminders(db,'2026-11-20');assert.ok(first.created>0);
 assert.equal(queueDailyInternalReminders(db,'2026-11-20').created,0);
 assert.equal(db.payments.length,before);
 assert.ok(db.reminderNotifications.every(n=>n.forDate==='2026-11-20'&&n.amountRemaining>0));
});

test('RBAC maker checker: manager approve, accountant execute, staff cannot',()=>{
 assert.equal(hasPermission({role:'manager'},'deposit.approve'),true);
 assert.equal(hasPermission({role:'accountant'},'deposit.approve'),false);
 assert.equal(hasPermission({role:'accountant'},'deposit.execute'),true);
 assert.equal(hasPermission({role:'staff'},'deposit.execute'),false);
});

test('Execute deposit settlement requires payment evidence and detects changed held balance',()=>{
 const db=sample(),lease=db.leases.find(l=>l.unitId==='u2');lease.status='ended';
 const p=submitDepositProposal(db,lease.id,{refund:18500000,deduction:0},a);approveDepositProposal(db,p.id,m);
 assert.throws(()=>executeDepositProposal(db,p.id,c),/chứng từ/);
 db.depositTransactions.push({id:'other',leaseId:lease.id,unitId:lease.unitId,kind:'settle',amount:1000000});
 assert.throws(()=>executeDepositProposal(db,p.id,c,{reference:'BANK-092'}),/Số dư cọc đã thay đổi/);
 assert.equal(p.status,'approved');
});

test('Repeated daily reminder job does not flood overdue cases each day',()=>{
 const db=sample();const first=queueDailyInternalReminders(db,'2026-11-20');const before=db.reminderNotifications.length;
 assert.ok(first.created>0);queueDailyInternalReminders(db,'2026-11-21');
 const kinds=new Set(db.reminderNotifications.map(n=>n.scheduleId+'|'+n.kind));
 assert.equal(kinds.size,db.reminderNotifications.length);assert.ok(db.reminderNotifications.length>=before);
});
