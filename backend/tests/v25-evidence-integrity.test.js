import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readVerifiedAttachment,verifyStoredAttachment,auditStoredAttachments,resolveAttachment} from '../src/payment-attachments.js';

const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const record=(bytes=pdf,override={})=>({
 id:'file-a',paymentId:'payment-1',status:'active',
 diskName:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
 filename:'Biên nhận riêng tư.pdf',mime:'application/pdf',size:bytes.length,
 sha256:createHash('sha256').update(bytes).digest('hex'),...override
});
async function tempDir(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aurel-evidence-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir}
const write=(dir,entry,bytes)=>fs.writeFile(path.join(dir,entry.diskName),bytes);

test('V2.5: file bytes are verified against original size, type, and SHA-256',async t=>{
 const dir=await tempDir(t),entry=record();await write(dir,entry,pdf);
 const actual=await readVerifiedAttachment(entry,{baseDir:dir});assert.deepEqual(actual,pdf);
 assert.deepEqual(verifyStoredAttachment(entry,pdf),pdf);
});
test('V2.5: tampering content with equal length is rejected',async t=>{
 const dir=await tempDir(t),entry=record(),tampered=Buffer.from(pdf);
 tampered[tampered.length-1]^=1;await write(dir,entry,tampered);
 await assert.rejects(readVerifiedAttachment(entry,{baseDir:dir}),e=>e.status===409);
});
test('V2.5: missing physical evidence fails closed',async t=>{
 const dir=await tempDir(t);
 await assert.rejects(readVerifiedAttachment(record(),{baseDir:dir}),e=>e.status===404);
});
test('V2.5: metadata size mismatch and missing digest fail closed',async()=>{
 assert.throws(()=>verifyStoredAttachment(record(pdf,{size:pdf.length+1}),pdf),e=>e.status===409);
 assert.throws(()=>verifyStoredAttachment(record(pdf,{sha256:null}),pdf),e=>e.status===409);
});
test('V2.5: a PDF file cannot masquerade as a PNG',async()=>{
 assert.throws(()=>verifyStoredAttachment(record(pdf,{mime:'image/png'}),pdf),e=>e.status===409);
});
test('V2.5: evidence disk identifier cannot escape its directory',async()=>{
 assert.throws(()=>resolveAttachment(record(pdf,{diskName:'../../secret.pdf'})),e=>e.status===500);
});
test('V2.5 regression / V2.8: read-only audit includes archived financial evidence',async t=>{
 const dir=await tempDir(t),good=record();await write(dir,good,pdf);
 const tampered=record(pdf,{id:'file-b',diskName:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf'});
 await write(dir,tampered,Buffer.from('%PDF-1.7\nTOTALLY DIFFERENT!!'));
 const missing=record(pdf,{id:'file-c',diskName:'cccccccc-cccc-4ccc-8ccc-cccccccccccc.pdf'});
 const archived=record(pdf,{id:'file-d',diskName:'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf',status:'archived'});
 const db={paymentAttachments:[good,tampered,missing,archived]};
 const before=await fs.readFile(path.join(dir,good.diskName));
 const audit=await auditStoredAttachments(db,{baseDir:dir});
 assert.deepEqual(audit.summary,{checked:4,valid:1,missing:2,corrupt:1});
 assert.deepEqual(audit.issues.map(x=>x.code),['INVALID_EVIDENCE','MISSING_EVIDENCE','MISSING_EVIDENCE']);
 assert.equal(JSON.stringify(audit).includes('Biên nhận riêng tư'),false);
 assert.deepEqual(await fs.readFile(path.join(dir,good.diskName)),before);
 assert.equal(db.paymentAttachments.length,4);
});
test('V2.5: auditor reports zero coverage distinctly from verified files',async()=>{
 const result=await auditStoredAttachments({paymentAttachments:[]});
 assert.equal(result.summary.checked,0);assert.equal(result.summary.valid,0);
});
test('V2.5: download endpoint checks stored bytes rather than blindly downloading a disk path',async()=>{
 const server=await fs.readFile(new URL('../src/index.js',import.meta.url),'utf8');
 const download=server.match(/app\.get\('\/api\/payment-attachments\/:id\/download'[\s\S]*?\n\}\);/);
 assert.ok(download);assert.match(download[0],/await readVerifiedAttachment\(entry\)/);
 assert.doesNotMatch(download[0],/res\.download\(/);
});
