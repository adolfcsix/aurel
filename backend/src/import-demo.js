import {updateDb,upgrade} from './store.js';
import {seed} from './seed.js';
import {log} from './domain.js';

if(process.env.AUREL_STORAGE!=='postgres')throw Error('Lệnh này chỉ dùng với AUREL_STORAGE=postgres');
if(process.env.ALLOW_DEMO_IMPORT!=='yes')throw Error('Đặt ALLOW_DEMO_IMPORT=yes để xác nhận nhập dữ liệu mẫu');

const demo = upgrade(seed());
const collections = Object.keys(demo).filter(key =>
 Array.isArray(demo[key]) && !['users','sessions','audit'].includes(key)
);

await updateDb(db => {
 if(collections.some(key => db[key].length)) {
  throw Error('PostgreSQL đã có hồ sơ nghiệp vụ. Chỉ được nhập mẫu vào kho trống.');
 }
 for(const key of collections)db[key] = demo[key];
 log(db,null,'demo.import','workspace');
});
console.log('Đã nhập dữ liệu mẫu.');
