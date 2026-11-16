import test from 'node:test';
import assert from 'node:assert/strict';
import {mappedRowsToCsv,normalizeSpreadsheetCell,validateColumnMapping,mappedFileDigest} from '../src/xlsx-units.js';
import {parseCSV,prepareUnitImport,inferImportMapping} from '../src/import-units.js';
import {validateAttachment,paymentEvidence} from '../src/payment-attachments.js';
import {upgrade} from '../src/store.js';
import {seed} from '../src/seed.js';

const headers=['Mã căn','Dự án','Giá thuê','Phí quản lý','Ghi chú'];
const rows=[headers,['DV02-2502','Rose Town',13500000,'3.7%','Gồm dấu phẩy, và dấu "nháy"'],['B3512','Hatay Millennium',9500000,'6','']];

test('XLSX mapping infers Vietnamese headers and produces CSV accepted by shared parser',()=>{
 const mapping=inferImportMapping(headers);
 assert.deepEqual(mapping,{code:0,project:1,rent:2,feePercent:3,notes:4});
 const csv=mappedRowsToCsv(rows,mapping),parsed=parseCSV(csv);
 assert.equal(parsed[0].record.notes,'Gồm dấu phẩy, và dấu "nháy"');
 assert.equal(parsed[1].record.rent,'9500000');
 const db=upgrade(seed()),report=prepareUnitImport(db,csv);
 assert.equal(report.errors.length,0);assert.equal(report.valid,2);
});

test('XLSX mapping allows missing optional fields, but rejects code omission and reused columns',()=>{
 assert.equal(validateColumnMapping(headers,{code:0,rent:''}).code,0);
 assert.throws(()=>mappedRowsToCsv(rows,{rent:2}),/Mã căn/);
 assert.throws(()=>mappedRowsToCsv(rows,{code:0,rent:0}),/nhiều trường/);
 assert.throws(()=>mappedRowsToCsv(rows,{code:7}),/phạm vi/);
});

test('Excel formulas are never evaluated: cached result is used, absent cache rejected',()=>{
 assert.equal(normalizeSpreadsheetCell({formula:'SUM(1,2)',result:3}),'3');
 assert.throws(()=>normalizeSpreadsheetCell({formula:'SUM(1,2)'}),/chưa được tính/);
 assert.equal(normalizeSpreadsheetCell({richText:[{text:'Dự '},{text:'án'}]}),'Dự án');
});

test('XLSX digest binds binary bytes, sheet and field mapping',()=>{
 const b=Buffer.from('ABC');const k=mappedFileDigest(b,'Data',{code:0,rent:2});
 assert.equal(k,mappedFileDigest(b,'Data',{rent:2,code:0}));
 assert.notEqual(k,mappedFileDigest(b,'Extra',{code:0,rent:2}));
 assert.notEqual(k,mappedFileDigest(Buffer.from('ACB'),'Data',{code:0,rent:2}));
});

test('Payment evidence only accepts magic-verified image or PDF and sanitizes filenames',()=>{
 const pdf=Buffer.from('%PDF-1.5\nhello evidence');
 const r=validateAttachment(pdf,'application/pdf','../hoá đơn.pdf');
 assert.equal(r.ext,'.pdf');assert.equal(r.filename,'.._hoá đơn.pdf');
 assert.match(r.sha256,/^[a-f0-9]{64}$/);
 assert.throws(()=>validateAttachment(pdf,'image/png','a.png'),/không khớp/);
 assert.throws(()=>validateAttachment(pdf,'application/javascript','payload.js'),/Chỉ nhận/);
 assert.throws(()=>validateAttachment(Buffer.alloc(0),'application/pdf','a.pdf'),/4 MB/);
});

test('Upgrading old data adds attachment collection without removing payment/fee records',()=>{
 const before=seed();const originalPayments=before.payments.length;
 const db=upgrade(before);assert.equal(db.version,9);assert.deepEqual(db.paymentAttachments,[]);
 assert.equal(db.payments.length,originalPayments);
 db.paymentAttachments.push({id:'p1',paymentId:'a',filename:'proof.pdf',mime:'application/pdf',sha256:'hash',diskName:'private.pdf',createdAt:'now'});
 const publicRows=paymentEvidence(db,'a');assert.equal(publicRows.length,1);
 assert.equal('diskName' in publicRows[0],false);
});

test('Payment evidence service creates protected private file and matching audit record',async()=>{
 const {addPaymentAttachment,resolveAttachment,removeOrphanAttachment}=await import('../src/payment-attachments.js');
 const fs=await import('node:fs/promises');
 const db=upgrade(seed()),payment=db.payments[0];
 payment.status='posted';
 const actor={id:'auditor-test',name:'Người kiểm thử'};
 const bytes=Buffer.from('%PDF-1.7\n% Proof attachment test');
 let record;
 try{
  record=await addPaymentAttachment(db,bytes,'application/pdf','evidence.pdf',payment.id,actor);
  const saved=await fs.readFile(resolveAttachment(record));assert.deepEqual(saved,bytes);
  assert.equal(paymentEvidence(db,payment.id).length,1);
  assert.equal(db.audit[0].event,'payment.attachment');
 }finally{if(record)await removeOrphanAttachment(record.diskName)}
});
