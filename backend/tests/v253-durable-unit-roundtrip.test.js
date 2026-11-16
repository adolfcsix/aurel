import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const run=(script,dir)=>spawnSync(process.execPath,['--input-type=module','-e',script],{
 cwd:repo,encoding:'utf8',env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dir,DATABASE_URL:'',ADMIN_INITIAL_PASSWORD:''}
});

test('V2.53: creating, editing and reopening unit persists values and revision across processes in isolated demo storage',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'aurel-v253-roundtrip-'));
 try{
  const writer=run(`
   import {getDb,updateDb} from './backend/src/store.js';
   import {cleanUnit} from './backend/src/unit-validation.js';
   import {assertUnitRevision,bumpUnitRevision} from './backend/src/unit-revisions.js';
   import {randomUUID} from 'node:crypto';
   const first=await getDb();const project=first.projects[0];
   if(!project)throw Error('Không có dự án thử nghiệm');
   const id=randomUUID(),base={id,createdAt:new Date().toISOString(),status:'draft',feeBasis:'due'};
   await updateDb(db=>{
    const u=cleanUnit({code:'V253-TEST-ONLY',projectId:project.id,area:65.5,bedrooms:2,interiorStatus:'partial',notes:'Bản nháp'},db,base);
    bumpUnitRevision(u);db.units.push(u);
   });
   await updateDb(db=>{
    const row=db.units.find(u=>u.id===id);assertUnitRevision(row,1);
    Object.assign(row,cleanUnit({area:72.75,bedrooms:3,interiorNotes:'Đã bổ sung nội thất',notes:'Hồ sơ mới'},db,row));
    bumpUnitRevision(row);
   });
   const saved=(await getDb()).units.find(u=>u.id===id);
   if(saved.area!==72.75||saved.revision!==2)throw Error('Lưu dữ liệu chưa đúng');
   process.stdout.write(id);
  `,dir);
  assert.equal(writer.status,0,writer.stderr);
  const id=writer.stdout.trim();assert.ok(id.length>20);
  const reader=run(`
   import {getDb} from './backend/src/store.js';
   const row=(await getDb()).units.find(u=>u.id===${JSON.stringify(id)});
   if(!row)throw Error('Không tìm thấy căn hộ sau khởi động lại');
   process.stdout.write(JSON.stringify({code:row.code,area:row.area,bedrooms:row.bedrooms,interiorNotes:row.interiorNotes,notes:row.notes,revision:row.revision}));
  `,dir);
  assert.equal(reader.status,0,reader.stderr);
  assert.deepEqual(JSON.parse(reader.stdout),{
   code:'V253-TEST-ONLY',area:72.75,bedrooms:3,interiorNotes:'Đã bổ sung nội thất',notes:'Hồ sơ mới',revision:2
  });
 }finally{rmSync(dir,{recursive:true,force:true});}
});
