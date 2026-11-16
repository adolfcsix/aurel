import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seed} from '../../backend/src/seed.js';
import {upgrade} from '../../backend/src/store.js';
import {cleanUnit} from '../../backend/src/unit-validation.js';

const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const dossier=readFileSync(new URL('../src/components/PropertyDossier.jsx',import.meta.url),'utf8');
const matrix=readFileSync(new URL('../../docs/qa/REQUIREMENTS_AND_ACCEPTANCE.md',import.meta.url),'utf8');

test('V2.51 manual web form covers the original apartment-management parameters without import',()=>{
 for(const key of ['code','projectId','buildingId','floorId','roomId','floor','room','address','area','bedrooms','interiorStatus','interiorNotes','ownerId','tenantId','managerId','saleId','rent','renewalRent','deposit','feePercent','feeBasis','leaseStart','leaseEnd','paymentDay','status','notes']){
  assert.match(app,new RegExp("name:'"+key+"'"),'Missing website field '+key);
 }
 assert.match(app,/case 'client':return .*name:'code',label:'Mã khách hàng'/);
 assert.match(app,/case 'staff':return .*name:'role',label:'Vị trí công tác'/);
});

test('V2.51 apartment records preserve rent renewal, fee basis, deposit, rent dates and free-text metadata directly',()=>{
 const db=upgrade(seed()),count=db.units.length;
 const record=cleanUnit({code:'QA-WEB-251',projectId:'rose',floor:'09',room:'09A',interiorStatus:'partial',interiorNotes:'Điều hòa, tủ lạnh',owner:'Chủ hồ sơ chưa liên kết',rent:12000000,renewalRent:13500000,deposit:24000000,feePercent:3.7,feeBasis:'paid',leaseStart:'2026-11-01',leaseEnd:'2027-10-31',paymentDay:5,notes:'Nhập trực tiếp trên website'},db,{status:'draft',feeBasis:'due',code:''});
 assert.equal(record.renewalRent,13500000);
 assert.equal(record.feePercent,3.7);
 assert.equal(record.feeBasis,'paid');
 assert.equal(record.deposit,24000000);
 assert.equal(record.paymentDay,5);
 assert.equal(record.interiorNotes,'Điều hòa, tủ lạnh');
 assert.equal(record.owner,'Chủ hồ sơ chưa liên kết');
 assert.equal(db.units.length,count,'Draft validation must not mutate stored records');
});

test('V2.51 still allows sparse drafts and a deliberate zero management fee',()=>{
 const db=upgrade(seed());
 const blank=cleanUnit({status:'draft',code:'WEB-DRAFT-251'},db,{status:'draft',feeBasis:'due',code:''});
 assert.equal(blank.owner||'', '');
 const zero=cleanUnit({feePercent:0},db,blank);
 assert.equal(zero.feePercent,0);
});

test('V2.51 dossier shows entered reference terms without treating them as collected cash',()=>{
 for(const item of ['Giá thuê gia hạn dự kiến','Tiền cọc tham khảo','Phí quản lý riêng','Cơ sở tính phí','Ngày bắt đầu dự kiến','Ngày kết thúc dự kiến','Ngày thu hằng tháng']) assert.ok(dossier.includes(item),item);
 assert.match(dossier,/\{showFinancial&&<>/,'Financial data must remain within permission gate');
 assert.match(dossier,/canOpenClient&&<>/,'Client codes must require client record privileges');
 assert.match(dossier,/unit\.floor\|\|floor\?\.code\|\|floor\?\.name/);
 assert.match(dossier,/unit\.room\|\|room\?\.code\|\|room\?\.name/);
});

test('V2.51 acceptance is based on website-managed parameters, not Excel import or synchronization',()=>{
 assert.match(matrix,/không phải yêu cầu tích hợp Excel/);
 assert.match(matrix,/nhập hay xuất Excel để hoàn thành nghiệp vụ cốt lõi/);
 assert.match(app,/Nhập tệp \(tùy chọn\)/);
 assert.match(app,/Nhập thông số căn hộ trực tiếp trên website/);
});
