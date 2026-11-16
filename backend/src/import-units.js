// CSV onboarding: validation and persistence share the same deterministic preparation.
// No unit, finance or contract data is mutated during preview.
import {create,active,fail} from './domain.js';
const MAX_ROWS=1500;
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const aliases={
 code:['ma can','ma can ho','can ho','unit code','code'],project:['du an','ten du an','project'],building:['toa','toa nha','building'],floor:['tang','floor'],room:['phong','so phong','so can','room'],interior:['noi that','tinh trang noi that','furniture','interior'],interiorNotes:['ghi chu noi that','mo ta noi that','interior notes'],address:['dia chi','dia chi can','address'],owner:['chu so huu','chu nha','ten chu ho','owner'],tenant:['khach thue','ten nguoi thue','tenant'],rent:['gia thue','gia thue hien tai','tien thue thang','doanh thu','rent'],feePercent:['phi ql can ho','phi quan ly','ty le phi','phi','fee percent'],manager:['nguoi phu trach','quan ly','manager'],sale:['sale','nhan vien sale'],notes:['ghi chu','notes']
};
const fieldByHeader=new Map(Object.entries(aliases).flatMap(([k,values])=>values.map(v=>[norm(v),k])));
export const importFields=Object.keys(aliases);
export function inferImportMapping(headers){
 const result={};for(const [i,label] of headers.entries()){
  const name=fieldByHeader.get(norm(label));if(name&&result[name]===undefined)result[name]=i;
 }return result;
}

function detectDelimiter(first){const count=c=>(first.match(new RegExp(c==='\t'?'\t':c==='|'?'\\|':c,'g'))||[]).length;return [',',';','\t'].sort((a,b)=>count(b)-count(a))[0]}
export function parseCSV(content){if(typeof content!=='string'||!content.trim())fail('Tệp CSV trống');if(Buffer.byteLength(content,'utf8')>1000*1024)fail('Tệp CSV tối đa 1 MB');
 const source=content.replace(/^\uFEFF/,'');const delimiter=detectDelimiter(source.split(/\r?\n/,1)[0]);const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<source.length;i++){const ch=source[i];if(ch==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++}else if(!quoted&&!cell)quoted=true;else if(quoted)quoted=false;else fail('Dấu nháy CSV không hợp lệ')}else if(ch===delimiter&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}else cell+=ch}
 if(quoted)fail('Dấu nháy kép CSV chưa đóng');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length<2)fail('CSV phải có dòng tiêu đề và ít nhất một dòng dữ liệu');if(rows.length>MAX_ROWS+1)fail(`Tệp vượt quá ${MAX_ROWS} dòng`);
 const keys=rows[0].map(s=>fieldByHeader.get(norm(s))||'');if(!keys.includes('code'))fail('Không tìm thấy cột Mã căn');if(new Set(keys.filter(Boolean)).size!==keys.filter(Boolean).length)fail('Có các cột trùng nghĩa trong tệp CSV');
 return rows.slice(1).map((values,i)=>({line:i+2,record:Object.fromEntries(keys.flatMap((k,j)=>k?[[k,(values[j]||'').trim()]]:[]))}));
}
export function normalizeInterior(value){const v=norm(value);if(!v)return '';if(['khong','khong noi that','trong','unfurnished'].includes(v))return 'unfurnished';if(['day du','du noi that','full','furnished','full furnished','noi that day du'].includes(v))return 'furnished';if(['co ban','noi that co ban','noi that mot phan','mot phan','partial','basic','semi furnished'].includes(v))return 'partial';return ''; }
function money(v,line,label){if(!v)return null;const str=String(v).replace(/\s|₫|vnd/gi,'');let n;
 if(/^\d{1,3}(\.\d{3})+$/.test(str))n=Number(str.replaceAll('.',''));
 else if(/^\d+(,\d{3})+$/.test(str))n=Number(str.replaceAll(',',''));
 else if(/^\d+$/.test(str))n=Number(str);
 else fail(`Dòng ${line}: ${label} không hợp lệ`);
 if(!Number.isSafeInteger(n)||n<0||n>1e12)fail(`Dòng ${line}: ${label} không hợp lệ`);return n;
}
function rate(v,line){if(!v)return null;const s=String(v).trim().replace('%','').replace(',','.');const n=Number(s);if(!Number.isFinite(n)||n<0||n>100)fail(`Dòng ${line}: tỷ lệ phí phải từ 0 đến 100`);return n}
const key=(projectId,building,code)=>[projectId, norm(building),norm(code)].join('|');
export function prepareUnitImport(db,csv){const records=parseCSV(csv),errors=[],warnings=[],prepared=[],seen=new Set();let duplicate=0;
 for(const {line,record:r} of records){try{
  if(!r.code)fail(`Dòng ${line}: mã căn không được trống trong tệp import`);
  // Excel may contain repeated display names. Never guess which project, tower or
  // employee a row refers to; a mistaken match could expose a different property.
  const projectMatches=r.project?(db.projects||[]).filter(p=>active(p)&&norm(p.name)===norm(r.project)):[];
  if(projectMatches.length>1)fail(`Dòng ${line}: trùng tên dự án “${r.project}”; cần xác định dự án duy nhất trước khi nhập`);
  const project=projectMatches[0];
  if(r.project&&!project)fail(`Dòng ${line}: dự án “${r.project}” chưa tồn tại, hãy tạo dự án trước`);
  const buildingMatches=r.building?(db.buildings||[]).filter(b=>active(b)&&String(b.projectId??'')===String(project?.id??'')&&(norm(b.code)===norm(r.building)||norm(b.name)===norm(r.building))):[];
  if(buildingMatches.length>1)fail(`Dòng ${line}: tòa nhà “${r.building}” chưa xác định duy nhất; hãy nhập mã tòa cụ thể`);
  const building=buildingMatches[0];
  if(r.building&&!building)warnings.push({line,message:'Chưa khớp tòa nhà trong danh mục; giữ tên tòa ở dạng văn bản, chưa tạo liên kết'});
  const uniqueStaff=(value,label)=>{
   if(!value)return null;
   const matches=(db.staff||[]).filter(s=>active(s)&&norm(s.name)===norm(value));
   if(matches.length!==1){warnings.push({line,message:matches.length?`${label} trùng họ tên: không tự phân công; cần chọn nhân viên bằng mã định danh`:`Không tìm thấy ${label.toLowerCase()}: để trống phân công`});return null}
   return matches[0];
  };
  const manager=uniqueStaff(r.manager,'Người phụ trách'),sale=uniqueStaff(r.sale,'Nhân viên kinh doanh');
  const unitKey=key(project?.id||'',building?.id||r.building||'',r.code);
  if(seen.has(unitKey))fail(`Dòng ${line}: trùng mã căn trong tệp`);seen.add(unitKey);
  if(db.units.some(u=>active(u)&&key(u.projectId||'',u.buildingId||u.building||'',u.code)===unitKey)){duplicate++;warnings.push({line,message:'Đã có mã căn trong hệ thống: bỏ qua, không ghi đè'});continue}
  const rent=money(r.rent,line,'giá thuê'),feePercent=rate(r.feePercent,line);
  if(r.interior&&!normalizeInterior(r.interior))warnings.push({line,message:'Mô tả nội thất chưa khớp trạng thái chuẩn; giữ lại trong ghi chú nội thất'});
  if(r.tenant)warnings.push({line,message:'Tên khách thuê được lưu tham khảo; chưa tạo hợp đồng hay công nợ'});
  prepared.push({code:r.code.slice(0,80),projectId:project?.id||'',buildingId:building?.id||'',building:building?.code||r.building||'',floor:(r.floor||'').slice(0,60),room:(r.room||'').slice(0,60),floorId:'',roomId:'',interiorStatus:normalizeInterior(r.interior),interiorNotes:(r.interiorNotes||(!normalizeInterior(r.interior)?r.interior:'')||'').slice(0,1000),address:(r.address||'').slice(0,300),owner:(r.owner||'').slice(0,160),tenant:(r.tenant||'').slice(0,160),managerId:manager?.id||'',saleId:sale?.id||'',rent,feePercent,feeBasis:'due',status:'draft',notes:(r.notes||'').slice(0,1500),leaseStart:'',leaseEnd:'',deposit:null,renewalRent:null,paymentDay:null,area:null,bedrooms:null,ownerId:'',tenantId:''});
 }catch(e){errors.push({line,message:e.message})}}
 return {total:records.length,valid:prepared.length,duplicates:duplicate,errors,warnings,preview:prepared.slice(0,20).map(u=>({code:u.code,project:db.projects.find(p=>p.id===u.projectId)?.name||'',building:u.building,rent:u.rent,feePercent:u.feePercent})),prepared};
}
export function applyUnitImport(db,csv,actor){const report=prepareUnitImport(db,csv);if(report.errors.length)fail('Không thể nhập: '+report.errors.slice(0,3).map(e=>e.message).join('; '),422);if(!report.valid)fail('Không có căn hộ mới để nhập',409);
 for(const item of report.prepared){const unit=create(item);db.units.push(unit);if(unit.feePercent!=null)db.feeHistory.push(create({unitId:unit.id,percent:unit.feePercent,basis:unit.feeBasis,effectiveFrom:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),reason:'Nhập danh mục CSV',changedBy:actor.id}));}
 return {imported:report.valid,skipped:report.duplicates};
}
