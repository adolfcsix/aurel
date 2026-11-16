import {unitPartyName} from './client-profile.js';

/** Explicit-column CSV export. Never serialize a whole unit record or private API fields. */
const safeCell=value=>{
 const text=String(value??'').replace(/\u0000/g,'');
 // Spreadsheet applications can execute values beginning with formula syntax.
 const neutral=/^[\s\u0009\u000d\u000a]*[=+@-]/.test(text);
 return '"'+(neutral?"'":'')+text.replaceAll('"','""')+'"';
};
export function exportUnitCatalogCSV(units,projects,{includePrivate=false,buildings=[],clients=[]}={}){
 const buildingNames=new Map((buildings||[]).map(b=>[String(b.id),b.name||b.code||'']));
 const statusLabels={draft:'Chưa hoàn thiện',vacant:'Còn trống',occupied:'Đang cho thuê',ended:'Đã kết thúc',archived:'Đã lưu trữ'};
 const projectNames=new Map((projects||[]).map(p=>[String(p.id),p.name||'']));
 const columns=[['Mã căn','code'],['Dự án','projectName'],['Tòa nhà','building'],['Tầng','floor'],['Số căn','room'],['Diện tích (m²)','area'],['Phòng ngủ','bedrooms'],['Trạng thái','status']];
 const privateColumns=[['Chủ sở hữu','owner'],['Khách thuê','tenant'],['Giá thuê tham khảo (VND)','rent'],['Phí quản lý (%)','feePercent']];
 const chosen=includePrivate?[...columns,...privateColumns]:columns;
 const source=(Array.isArray(units)?units:[]).map(u=>({
  code:u.code||'',projectName:projectNames.get(String(u.projectId))||'',building:buildingNames.get(String(u.buildingId))||u.building||'',floor:u.floor||'',room:u.room||'',area:u.area??'',bedrooms:u.bedrooms??'',status:statusLabels[u.status]||u.status||'',
  ...(includePrivate?{owner:unitPartyName({clients},u,'owner'),tenant:unitPartyName({clients},u,'tenant'),rent:u.rent??'',feePercent:u.feePercent??''}:{})
 }));
 return '\uFEFF'+[chosen.map(([label])=>safeCell(label)).join(','),...source.map(u=>chosen.map(([,key])=>safeCell(u[key])).join(','))].join('\r\n');
}
