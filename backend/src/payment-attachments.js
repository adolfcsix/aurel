// Locally stored evidence is not a payment: it documents a posted receipt.
// For production, place this directory on backed-up encrypted storage and run malware scanning.
import path from 'node:path';
import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fail,find,create,log} from './domain.js';
export const MAX_ATTACHMENT_BYTES=4*1024*1024;
// Keep financial evidence in the same data environment as its ledger.
// PostgreSQL installations should supply an absolute AUREL_EVIDENCE_DIR and back it
// up together with PostgreSQL. JSON smoke runs use a disposable per-run folder.
export const attachmentDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data/payment-attachments');
export function evidenceDirectory(env=process.env){
 const custom=String(env.AUREL_EVIDENCE_DIR||'').trim();
 if(custom)return path.resolve(custom);
 const demo=String(env.AUREL_DEMO_DATA_DIR||'').trim();
 if(env.AUREL_STORAGE!=='postgres'&&demo)return path.join(path.resolve(demo),'payment-attachments');
 return attachmentDir;
}
const allowed={
 'application/pdf':{ext:'.pdf',check:b=>b.subarray(0,5).toString('ascii')==='%PDF-'},
 'image/png':{ext:'.png',check:b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
 'image/jpeg':{ext:'.jpg',check:b=>b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255}
};
export function validateAttachment(buffer,mime,filename){
 const type=allowed[mime];if(!type)fail('Chỉ nhận PDF, PNG và JPEG',415);
 if(!Buffer.isBuffer(buffer)||buffer.length<8||buffer.length>MAX_ATTACHMENT_BYTES)fail('Chứng từ phải từ 8 byte đến 4 MB',413);
 if(!type.check(buffer))fail('Nội dung tệp không khớp định dạng đã chọn',415);
 const clean=String(filename||'Chứng từ').replace(/[\x00-\x1f/\\<>:"|?*]/g,'_').slice(0,140).trim()||'Chứng từ';
 return {mime,filename:clean,ext:type.ext,sha256:createHash('sha256').update(buffer).digest('hex')};
}
export function paymentEvidence(db,paymentId){
 return db.paymentAttachments.filter(a=>a.paymentId===paymentId&&a.status!=='archived')
  .map(({id,paymentId,filename,mime,size,createdAt,uploadedBy,sha256})=>({id,paymentId,filename,mime,size,createdAt,uploadedBy,sha256}));
}
export async function addPaymentAttachment(db,buffer,mime,filename,paymentId,actor){
 const payment=find(db.payments,paymentId,'Khoản thanh toán');
 if(payment.status!=='posted')fail('Chỉ bổ sung chứng từ cho khoản thu đang có hiệu lực',409);
 const details=validateAttachment(buffer,mime,filename);
 const id=randomUUID(),diskName=id+details.ext;
 const dir=evidenceDirectory();
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 await fs.writeFile(path.join(dir,diskName),buffer,{flag:'wx',mode:0o600});
 const record=create({id,paymentId,unitId:payment.unitId,leaseId:payment.leaseId,filename:details.filename,mime:details.mime,size:buffer.length,sha256:details.sha256,diskName,uploadedBy:actor.id});
 db.paymentAttachments.push(record);log(db,actor,'payment.attachment',paymentId,null,{id,filename:record.filename,sha256:record.sha256});
 return record;
}
export async function removeOrphanAttachment(id){
 if(!/^[a-f0-9-]{36}(\.pdf|\.png|\.jpg)$/.test(id))return;
 await fs.rm(path.join(evidenceDirectory(),id),{force:true}).catch(()=>{});
}
export function resolveAttachment(record,baseDir=evidenceDirectory()){
 if(!/^[a-f0-9-]{36}(\.pdf|\.png|\.jpg)$/.test(record.diskName||''))fail('Tên tệp chứng từ không hợp lệ',500);
 return path.join(baseDir,record.diskName);
}

/**
 * Verify the bytes actually stored on disk before serving a receipt.
 * A database row by itself does not prove that the document still exists or
 * matches the hash captured on upload. These checks are read-only.
 */
export function verifyStoredAttachment(record,bytes){
 const type=allowed[record?.mime];
 if(!type||!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>MAX_ATTACHMENT_BYTES||!type.check(bytes))
  fail('Định dạng hoặc nội dung chứng từ lưu trữ không hợp lệ',409);
 if(!Number.isSafeInteger(record.size)||bytes.length!==record.size)
  fail('Kích thước chứng từ đã thay đổi so với biên nhận',409);
 if(!/^[a-f0-9]{64}$/i.test(record.sha256||'')||
    createHash('sha256').update(bytes).digest('hex')!==record.sha256.toLowerCase())
  fail('Chứng từ không khớp mã kiểm tra toàn vẹn',409);
 return bytes;
}

export async function readVerifiedAttachment(record,{baseDir=evidenceDirectory()}={}){
 const filepath=resolveAttachment(record,baseDir);
 // A tampered metadata row must never cause an unbounded file read.
 if(!Number.isSafeInteger(record.size)||record.size<8||record.size>MAX_ATTACHMENT_BYTES)
  fail('Kích thước chứng từ trong hồ sơ không hợp lệ',409);
 let file;
 try{
  // O_NOFOLLOW prevents reading a different file through a symlink swapped in
  // after the directory scan (where supported by the operating system).
  const info=await fs.lstat(filepath);
  if(!info.isFile())fail('Đường dẫn chứng từ không phải tệp thông thường',409);
  file=await fs.open(filepath,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW||0));
  const stat=await file.stat();
  if(!stat.isFile()||stat.size!==record.size)
   fail('Kích thước chứng từ đã thay đổi so với biên nhận',409);
  const bytes=Buffer.alloc(record.size);
  let position=0;
  while(position<bytes.length){
   const {bytesRead}=await file.read(bytes,position,bytes.length-position,position);
   if(!bytesRead)fail('Chứng từ bị cắt ngắn trong khi đọc',409);
   position+=bytesRead;
  }
  // Detect data appended while the file was being read, without loading it.
  const {bytesRead:extra}=await file.read(Buffer.alloc(1),0,1,bytes.length);
  if(extra)fail('Kích thước chứng từ đã thay đổi trong khi đọc',409);
  return verifyStoredAttachment(record,bytes);
 }catch(error){
  if(error.code==='ENOENT')fail('Tệp chứng từ không còn trên ổ lưu trữ',404);
  if(error.code==='ELOOP')fail('Không cho phép liên kết tượng trưng trong kho chứng từ',409);
  throw error;
 }finally{await file?.close()}
}

/** Read-only QA. Deliberately expose codes/counts, not file names or hashes. */
export async function auditStoredAttachments(db,{baseDir=evidenceDirectory(),maxIssues=1000}={}){
 // Archived receipts remain part of the financial audit trail. Do not skip them:
 // the download UI may hide archived rows, but their retained files must still
 // exist and match the original metadata.
 const rows=db.paymentAttachments||[];
 const issues=[];const totals={checked:0,valid:0,missing:0,corrupt:0};
 for(const record of rows){
  totals.checked++;
  try{await readVerifiedAttachment(record,{baseDir});totals.valid++}
  catch(error){
   const missing=error.status===404;
   if(missing)totals.missing++;else totals.corrupt++;
   if(issues.length<maxIssues)issues.push({code:missing?'MISSING_EVIDENCE':'INVALID_EVIDENCE',index:totals.checked});
  }
 }
 return {summary:totals,issues,truncated:totals.missing+totals.corrupt>issues.length};
}

/** Read-only cross-check between the metadata index and private file store.
 * Files absent from the metadata index can result from an interrupted upload
 * or copying the wrong attachment folder. Do not auto-delete them: their
 * ownership must be investigated before any cleanup.
 * Neither filenames nor paths are returned to callers.
 */
export async function auditUnindexedAttachments(db,{baseDir=evidenceDirectory()}={}){
 let entries;
 try{entries=await fs.readdir(baseDir,{withFileTypes:true})}
 catch(error){if(error.code==='ENOENT')return {scanned:0,unindexed:0};throw error}
 const index=new Set((db.paymentAttachments||[]).map(row=>row.diskName).filter(Boolean));
 let scanned=0,unindexed=0;
 for(const item of entries){
  if(!/^[a-f0-9-]{36}\.(?:pdf|png|jpg)$/.test(item.name))continue;
  if(!item.isFile()&&!item.isSymbolicLink())continue;
  scanned++;
  if(!index.has(item.name))unindexed++;
 }
 return {scanned,unindexed};
}
