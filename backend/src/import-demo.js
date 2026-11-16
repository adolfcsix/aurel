import {getDb,updateDb,upgrade} from './store.js';
import {seed} from './seed.js';
if(process.env.AUREL_STORAGE!=='postgres')throw Error('Lệnh này chỉ dùng với AUREL_STORAGE=postgres');
if(process.env.ALLOW_DEMO_IMPORT!=='yes')throw Error('Đặt ALLOW_DEMO_IMPORT=yes để xác nhận nhập dữ liệu DEMO');
const before=await getDb();if(before.projects.length||before.units.length)throw Error('PostgreSQL đã có dữ liệu. Không nhập đè dữ liệu thật.');
const original=upgrade(seed());
await updateDb(db=>{for(const name of ['projects','buildings','staff','clients','units','leases','schedules','payments','depositTransactions','feeHistory','audit'])db[name]=structuredClone(original[name]||[]);db.preferences=original.preferences;});
console.log('Đã nhập dữ liệu mẫu cơ bản. không dùng số liệu demo cho nghiệp vụ thật.');
