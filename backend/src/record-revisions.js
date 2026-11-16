/**
 * Optimistic editing for business dossiers. Legacy records without a revision
 * start at zero; each successful write advances the persisted revision.
 * All revision checks belong inside updateDb's serialized transaction.
 */
import {fail} from './domain.js';
export function recordRevision(record){
 const value=record?.revision??0;
 return Number.isSafeInteger(value)&&value>=0?value:0;
}
export function assertRecordRevision(record,expected,label='Hồ sơ'){
 if(expected===undefined)fail(`Thiếu phiên bản ${label.toLowerCase()}. Hãy tải lại hồ sơ trước khi chỉnh sửa.`,428);
 if(!Number.isSafeInteger(expected)||expected<0)fail('Phiên bản hồ sơ không hợp lệ',400);
 if(expected!==recordRevision(record))fail(`${label} đã được cập nhật ở phiên làm việc khác. Hãy tải lại hồ sơ trước khi lưu.`,409);
}
export function bumpRecordRevision(record){
 const current=recordRevision(record);
 if(current>=Number.MAX_SAFE_INTEGER)fail('Phiên bản hồ sơ đã vượt giới hạn');
 record.revision=current+1;
 record.updatedAt=new Date().toISOString();
 return record;
}
/** Mirror an actual business change without inventing a new edit revision for a no-op. */
export function updateRecordFields(record,changes){
 let changed=false;
 for(const [key,value] of Object.entries(changes))if(record[key]!==value){record[key]=value;changed=true;}
 if(changed)bumpRecordRevision(record);
 return changed;
}
