// ExcelJS loads .xlsx only; no formulas are evaluated or workbook macros executed.
// Shared CSV validation remains the single source of truth for import rules.
import {createHash} from 'node:crypto';
import {fail} from './domain.js';
import {aliases,importFields,inferImportMapping} from './import-units.js';
export const MAX_XLSX_BYTES=2*1024*1024;
const MAX_DATA_ROWS=1500,MAX_COLUMNS=60;
export const fieldOptions=importFields.map(value=>({value,label:aliases[value][0]}));
export function normalizeSpreadsheetCell(value){
 if(value==null)return '';
 if(value instanceof Date)return Number.isNaN(value.getTime())?'':value.toISOString().slice(0,10);
 if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
 if(typeof value==='object'){
  if(Array.isArray(value.richText))return value.richText.map(x=>x.text||'').join('');
  if(typeof value.text==='string')return value.text;
  if('formula' in value||'sharedFormula' in value){
    if(value.result==null)fail('Có ô công thức chưa được tính kết quả. Hãy mở và lưu lại trong Excel trước khi nhập.');
    return normalizeSpreadsheetCell(value.result);
  }
  if('error' in value)fail('Tệp chứa ô lỗi công thức. Vui lòng kiểm tra bảng tính.');
 }
 fail('Tệp Excel có một ô dữ liệu không hỗ trợ');
}
export function validateColumnMapping(headers,mapping){
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))fail('Cấu hình ánh xạ cột không hợp lệ');
 const out={},used=new Set();
 for(const [key,raw] of Object.entries(mapping)){
  if(!importFields.includes(key))fail('Tên trường không hợp lệ: '+key);
  if(raw===''||raw==null)continue;
  const i=Number(raw);
  if(!Number.isInteger(i)||i<0||i>=headers.length||i>=MAX_COLUMNS)fail('Chỉ số cột vượt phạm vi');
  if(used.has(i))fail('Một cột Excel không thể ánh xạ thành nhiều trường');
  used.add(i);out[key]=i;
 }
 if(out.code===undefined)fail('Phải ánh xạ trường Mã căn');
 return out;
}
function csvCell(value){return '"'+String(value??'').replaceAll('"','""')+'"'}
export function mappedRowsToCsv(rows,mapping){
 if(!Array.isArray(rows)||!rows.length)fail('Bảng Excel trống');
 const headers=rows[0],selected=validateColumnMapping(headers,mapping);
 const fields=Object.keys(selected);
 if(rows.length<2)fail('Không có dòng căn hộ trong bảng Excel');
 if(rows.length-1>MAX_DATA_ROWS)fail('Tối đa 1.500 dòng dữ liệu');
 return [fields.map(k=>csvCell(aliases[k][0])).join(','),...rows.slice(1).map(row=>fields.map(k=>csvCell(row[selected[k]]??'')).join(','))].join('\r\n');
}
export function mappedFileDigest(buffer,sheet,mapping){
 return createHash('sha256').update(buffer).update('\n'+sheet+'\n'+JSON.stringify(Object.fromEntries(Object.entries(mapping).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
}
export async function readWorkbook(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<30||buffer.length>MAX_XLSX_BYTES)fail('XLSX phải có dung lượng từ 30 byte đến 2 MB',413);
 if(buffer[0]!==0x50||buffer[1]!==0x4b)fail('Tệp không phải định dạng XLSX hợp lệ');
 // Dependency intentionally lazy: CSV operations and domain tests work without ExcelJS.
 let ExcelJS;try{({default:ExcelJS}=await import('exceljs'))}catch{fail('Chưa cài exceljs (tiện ích Excel tùy chọn). Cài bằng npm install --include=optional trước khi nhập XLSX',503)}
 const workbook=new ExcelJS.Workbook();
 try{await workbook.xlsx.load(buffer)}catch{fail('Không đọc được XLSX: tệp lỗi, được mã hóa hoặc không đúng định dạng',422)}
 if(!workbook.worksheets.length||workbook.worksheets.length>15)fail('Tệp phải có từ 1 đến 15 trang tính');
 return workbook;
}
export function worksheetToRows(sheet){
 if(!sheet)fail('Không tìm thấy trang tính');
 if(sheet.rowCount<2||sheet.rowCount>MAX_DATA_ROWS+1)fail('Trang tính cần có 1 đến 1.500 dòng dữ liệu');
 if(sheet.columnCount>MAX_COLUMNS)fail('Trang tính vượt quá 60 cột');
 const rows=[];
 for(let i=1;i<=sheet.rowCount;i++){
  const row=sheet.getRow(i),cells=[];
  for(let j=1;j<=Math.max(1,sheet.columnCount);j++)cells.push(normalizeSpreadsheetCell(row.getCell(j).value).trim());
  if(i===1||cells.some(Boolean))rows.push(cells);
 }
 return rows;
}
export function inspectWorkbook(workbook){
 return {sheets:workbook.worksheets.map(x=>({name:x.name,rows:Math.max(0,x.rowCount-1)}))};
}
export function inspectSheet(rows){
 return {headers:rows[0]||[],mapping:inferImportMapping(rows[0]||[]),sample:rows.slice(1,6),fields:fieldOptions,rows:rows.length-1};
}
