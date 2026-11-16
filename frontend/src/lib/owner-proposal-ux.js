/** Owner-facing input review. The backend remains the only authority for
 * ownership, concurrent revisions, requests and changes to shared records. */
export const editableOwnerFields=Object.freeze(['address','area','bedrooms','interiorStatus']);
const interiors=new Set(['','unfurnished','partial','furnished']);

export function ownerProposalDraftValue(serverValue,draft,touched){
 return touched?draft:(serverValue??'');
}

export function reviewOwnerProposalDraft(unit,field,value,reason){
 const errors=[];
 if(!unit||!editableOwnerFields.includes(field))return {valid:false,errors:['Thông số đề nghị không hợp lệ.'],value:null};
 const text=typeof reason==='string'?reason.trim():'';
 if(!text||text.length>800)errors.push('Vui lòng nêu lý do điều chỉnh (tối đa 800 ký tự).');
 let normalized;
 if(field==='area'||field==='bedrooms'){
  if(value==null||String(value).trim()==='')normalized=null;
  else{
   normalized=Number(value);
   if(!Number.isFinite(normalized)||normalized<0||normalized>10000||(field==='bedrooms'&&!Number.isInteger(normalized))){
    errors.push(field==='area'?'Diện tích phải là số từ 0 đến 10.000 m².':'Số phòng ngủ phải là số nguyên từ 0 đến 10.000.');
   }
  }
  if(Object.is(normalized,unit[field]??null))errors.push('Giá trị đề nghị không khác thông tin đang lưu.');
 }else{
  if(typeof value!=='string'||value.length>300)errors.push('Nội dung đề nghị không được vượt 300 ký tự.');
  normalized=typeof value==='string'?value.trim():'';
  if(field==='interiorStatus'&&!interiors.has(normalized))errors.push('Tình trạng nội thất không hợp lệ.');
  if(normalized===String(unit[field]??'').trim())errors.push('Giá trị đề nghị không khác thông tin đang lưu.');
 }
 return {valid:errors.length===0,errors,value:normalized,reason:text};
}
