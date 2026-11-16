import test from 'node:test';
import assert from 'node:assert/strict';
import {feeLabel,recordFinancial,unitLocation,contractDuration} from '../src/lib/record-presentation.js';
const money=n=>`${Number(n).toLocaleString('vi-VN')} đ`;
test('V1.3: missing rent is not displayed as zero money',()=>{
 assert.equal(recordFinancial({rent:''},money),'Chưa có giá thuê');
 assert.equal(recordFinancial({rent:null},money),'Chưa có giá thuê');
 assert.equal(recordFinancial({rent:0},money),'0 đ');
 assert.equal(recordFinancial({rent:9500000},money),'9.500.000 đ');
});
test('V1.3: fee percentage distinguishes zero from missing',()=>{
 assert.equal(feeLabel({feePercent:0}),'0%');
 assert.equal(feeLabel({feePercent:'3.7'}),'3.7%');
 assert.equal(feeLabel({feePercent:''}),'Chưa thiết lập');
});
test('V1.3: compact location omits fields without making data mandatory',()=>{
 assert.equal(unitLocation({building:'I2',floor:'26',room:'16'}),'Tòa I2 · Tầng 26 · Phòng 16');
 assert.equal(unitLocation({floor:0}),'Tầng 0');
 assert.equal(unitLocation({}),'Chưa cập nhật vị trí');
 assert.equal(unitLocation({buildingId:'B1',floor:9},'A'),'Tòa A · Tầng 9');
});
test('V1.3: lease dates are readable when draft dates are missing',()=>{
 assert.equal(contractDuration({startsOn:'2026-11-01',endsOn:''},s=>s),'2026-11-01 – Chưa có');
});
