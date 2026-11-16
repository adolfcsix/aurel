import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {prepareUnitImport,applyUnitImport} from '../src/import-units.js';

const fixture=()=>upgrade(seed());
const actor={id:'qa-manager',name:'Quản lý thử nghiệm'};

test('V2.50 rejects ambiguous project names rather than selecting the first property',()=>{
 const db=fixture();db.projects.push({...db.projects.find(p=>p.id==='rose'),id:'other-rose'});
 const source='Mã căn,Dự án,Tòa nhà,Giá thuê\nQA-1,Rose Town,DV02,10000000';
 const original=db.units.length;
 const report=prepareUnitImport(db,source);
 assert.equal(report.valid,0);assert.equal(report.errors.length,1);
 assert.match(report.errors[0].message,/trùng tên dự án/);
 assert.throws(()=>applyUnitImport(db,source,actor),/Không thể nhập/);
 assert.equal(db.units.length,original);
});

test('V2.50 refuses ambiguous building aliases within one project',()=>{
 const db=fixture();const tower=db.buildings.find(x=>x.projectId==='rose'&&x.code==='DV02');
 db.buildings.push({...tower,id:'duplicate-tower'});
 const report=prepareUnitImport(db,'Mã căn,Dự án,Tòa nhà\nQA-2,Rose Town,DV02');
 assert.equal(report.valid,0);assert.match(report.errors[0].message,/tòa nhà.*duy nhất/);
});

test('V2.50 does not silently assign a staff member when full names are duplicated',()=>{
 const db=fixture(),staff=db.staff.find(x=>x.name==='Nguyễn Minh Anh');
 db.staff.push({...staff,id:'second-named-manager'});
 const report=prepareUnitImport(db,'Mã căn,Dự án,Người phụ trách,Nhân viên Sale\nQA-3,Rose Town,Nguyễn Minh Anh,Trần Hoài Nam');
 assert.equal(report.errors.length,0);assert.equal(report.valid,1);
 assert.equal(report.prepared[0].managerId,'');
 assert.equal(report.prepared[0].saleId,'s2');
 assert.ok(report.warnings.some(x=>/trùng họ tên/.test(x.message)));
});

test('V2.50 flags missing sale and tower references while preserving draft import',()=>{
 const db=fixture(),schedules=db.schedules.length,payments=db.payments.length;
 const report=prepareUnitImport(db,'Mã căn,Dự án,Tòa nhà,Nhân viên Sale,Giá thuê,Phí quản lý\nQA-4,Rose Town,Tòa chưa có,Không có người này,12000000,"3,7%"');
 assert.equal(report.errors.length,0);assert.equal(report.valid,1);
 assert.equal(report.prepared[0].buildingId,'');
 assert.equal(report.prepared[0].building,'Tòa chưa có');
 assert.equal(report.prepared[0].saleId,'');
 assert.ok(report.warnings.some(x=>/tòa nhà/.test(x.message)));
 assert.ok(report.warnings.some(x=>/nhân viên kinh doanh/i.test(x.message)));
 applyUnitImport(db,'Mã căn,Dự án,Tòa nhà,Nhân viên Sale,Giá thuê,Phí quản lý\nQA-4,Rose Town,Tòa chưa có,Không có người này,12000000,"3,7%"',actor);
 assert.equal(db.units.at(-1).status,'draft');
 assert.equal(db.units.at(-1).feePercent,3.7);
 assert.equal(db.schedules.length,schedules);assert.equal(db.payments.length,payments);
});

test('V2.50 retains unique staff assignments and optional imported columns',()=>{
 const db=fixture();const report=prepareUnitImport(db,'Mã căn,Nhân viên Sale,Người phụ trách\nQA-5,Trần Hoài Nam,Nguyễn Minh Anh');
 assert.equal(report.errors.length,0);assert.equal(report.valid,1);
 assert.equal(report.prepared[0].projectId,'');
 assert.equal(report.prepared[0].managerId,'s1');assert.equal(report.prepared[0].saleId,'s2');
 assert.equal(report.prepared[0].rent,null);assert.equal(report.prepared[0].status,'draft');
});

test('V2.50 import UI explicitly warns about unmapped original Excel columns before committing',()=>{
 const source=readFileSync(new URL('../../frontend/src/components/ImportPanel.jsx',import.meta.url),'utf8');
 assert.match(source,/ignoredExcelHeaders/);
 assert.match(source,/cột chưa được ánh xạ sẽ không nhập/);
 assert.match(source,/Hãy đối chiếu các cột này với bảng gốc trước khi xác nhận/);
});
