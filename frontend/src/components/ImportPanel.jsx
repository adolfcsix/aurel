import React,{useEffect,useState,useRef} from 'react';
import {protectPendingWork} from '../lib/unload-guard.js';
import {isOutcomeUncertain} from '../lib/commit-safety.js';
import {createSubmissionGate,submissionLockedMessage} from '../lib/submission-gate.js';
import {api,apiBinary} from '../lib/http.js';
import {Btn,Icon} from './Ui.jsx';

const uploadType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const outputMoney=n=>n==null?'—':new Intl.NumberFormat('vi-VN').format(n);
const fieldLabels={code:'Mã căn',project:'Dự án',building:'Tòa nhà',floor:'Tầng',room:'Phòng / số căn',interior:'Nội thất',interiorNotes:'Ghi chú nội thất',address:'Địa chỉ',owner:'Chủ sở hữu',tenant:'Khách thuê',rent:'Giá thuê',feePercent:'Phí quản lý (%)',manager:'Người phụ trách',sale:'Nhân viên kinh doanh',notes:'Ghi chú'};
export default function ImportPanel({onImported,onUncertain,canCommit}){
 const [mode,setMode]=useState('xlsx'),[file,setFile]=useState(null),[csv,setCsv]=useState('');
 const [sheets,setSheets]=useState([]),[sheet,setSheet]=useState(''),[headers,setHeaders]=useState([]);
 const [mapping,setMapping]=useState({}),[sample,setSample]=useState([]),[fields,setFields]=useState([]);
 const [report,setReport]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const reading=useRef(false);
 const startRead=()=>{if(reading.current||gate.current.locked)return false;reading.current=true;setBusy(true);return true};
 const finishRead=()=>{reading.current=false;setBusy(false)};
 const resetMode=next=>{if(reading.current||gate.current.locked)return;setMode(next);setFile(null);setCsv('');setSheets([]);setSheet('');setHeaders([]);setMapping({});setSample([]);setFields([]);messageClear()};
 const gate=useRef(createSubmissionGate());const [locked,setLocked]=useState(false);
 useEffect(()=>protectPendingWork(window,busy||!!file||!!csv.trim()),[busy,file,csv]);
 // Tell operators which original spreadsheet columns will be discarded rather
 // than silently implying that every Excel field becomes an AUREL field.
 const mappedColumnIndexes=new Set(Object.values(mapping).filter(x=>x!==''&&x!=null).map(Number));
 const ignoredExcelHeaders=headers.filter((heading,index)=>String(heading??'').trim()&&!mappedColumnIndexes.has(index));
 const messageClear=()=>{setError('');setSuccess('');setReport(null)};
 const send=(endpoint,more={})=>apiBinary('/import/units/xlsx/'+endpoint,{body:file,headers:{'Content-Type':uploadType,'X-Aurel-Sheet':sheet,'X-Aurel-Mapping':JSON.stringify(mapping),...more}});
 const choose=async(e)=>{
  if(!startRead())return;
  try{
  const selected=e.target.files?.[0];messageClear();setFile(null);setCsv('');setHeaders([]);
  if(!selected)return;
  if(mode==='xlsx'){
   if(!/\.xlsx$/i.test(selected.name)){setError('Vui lòng chọn tệp Excel .xlsx (không hỗ trợ .xls hoặc .xlsm)');return}
   if(selected.size>2*1024*1024){setError('Tệp XLSX phải nhỏ hơn 2 MB');return}
   setBusy(true);
   try{
    const initial=await apiBinary('/import/units/xlsx/inspect',{body:selected,headers:{'Content-Type':uploadType}});
    setFile(selected);setSheets(initial.sheets);setSheet(initial.selected);setHeaders(initial.headers);setMapping(initial.mapping);setSample(initial.sample);setFields(initial.fields);
   }catch(err){setError(err.message)}
  }else{
   if(!/\.(csv|txt)$/i.test(selected.name)){setError('Chỉ chấp nhận CSV UTF-8');return}
   if(selected.size>1024*1000){setError('CSV phải nhỏ hơn 1 MB');return}
   setFile(selected);setCsv(await selected.text());
  }
  }catch(err){setError(err.message)}finally{finishRead()}
 };
 const sheetChange=async(name)=>{
  if(!startRead())return;
  setSheet(name);setReport(null);setError('');setBusy(true);
  try{
   const result=await apiBinary('/import/units/xlsx/sheet',{body:file,headers:{'Content-Type':uploadType,'X-Aurel-Sheet':name}});
   setHeaders(result.headers);setMapping(result.mapping);setSample(result.sample);setFields(result.fields);
  }catch(err){setError(err.message)}finally{finishRead()}
 };
 const preview=async()=>{
  if(!startRead())return;
  setBusy(true);messageClear();
  try{
   const result=mode==='xlsx'?await send('preview'):await api('/import/units/preview',{method:'POST',body:{csv}});
   setReport(result);
  }catch(err){setError(err.message)}finally{finishRead()}
 };
 const commit=async()=>{
  if(reading.current||!report||report.errors.length||!report.valid||canCommit?.()===false||!gate.current.begin())return;
  setBusy(true);setError('');
  try{
   const result=mode==='xlsx'?await send('commit',{'X-Aurel-Digest':report.digest,'X-Aurel-Preview-Token':report.previewToken}):await api('/import/units/commit',{method:'POST',body:{csv,digest:report.digest,previewToken:report.previewToken}});
   gate.current.confirmed();setLocked(true);
   const refreshed=await onImported();
   setSuccess(refreshed===false?`Máy chủ đã xác nhận nhập ${result.imported} căn; chưa tải lại được danh mục. Không gửi lại tệp.`:`Máy chủ đã xác nhận nhập ${result.imported} căn; bỏ qua ${result.skipped} căn trùng.`);
   setFile(null);setCsv('');setReport(null);setHeaders([]);
   if(refreshed!==false&&gate.current.nextAfterRefresh())setLocked(false);
  }catch(err){
   if(isOutcomeUncertain(err)){
    gate.current.uncertain();setLocked(true);setError(submissionLockedMessage);await onUncertain?.();
   }else{
    gate.current.rejected();setError(gate.current.locked?submissionLockedMessage:err.message);
   }
  }finally{setBusy(false)}
 };
 return <div className="import-layout">
  <section className="panel pad-panel import-editor"><fieldset className="aurel-import-fields" disabled={busy||locked} aria-busy={busy}><legend className="sr-only">Nhập danh mục căn hộ</legend><div className="eyebrow">NHẬP DỮ LIỆU · XEM TRƯỚC CÓ ĐỐI CHIẾU</div><h3>Nhập danh mục căn hộ</h3>
   <p className="import-description">Nhập <b>.xlsx</b> trực tiếp hoặc CSV UTF-8. Tệp sẽ được kiểm tra trên backend; không tự ghi đè căn hộ hiện có, tạo hợp đồng, ghi nhận công nợ hoặc tiền cọc.</p>
   <div className="import-tabs" role="group" aria-label="Định dạng tệp">
    <button type="button" className={mode==='xlsx'?'active':''} onClick={()=>resetMode('xlsx')}>Excel .xlsx</button>
    <button type="button" className={mode==='csv'?'active':''} onClick={()=>resetMode('csv')}>CSV UTF-8</button>
   </div>
   <label className="import-picker"><Icon name="download" size={20}/><span><b>{file?.name||('Chọn tệp '+(mode==='xlsx'?'Excel':'CSV'))}</b><small>{mode==='xlsx'?'Tối đa 2 MB · 1.500 dòng / trang tính':'Tối đa 1 MB · 1.500 dòng'}</small></span><input type="file" accept={mode==='xlsx'?'.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'.csv,.txt,text/csv'} onChange={choose}/></label>
   {mode==='xlsx'?<>
    {sheets.length>0&&file&&<><div className="import-select-row"><label htmlFor="xlsx-sheet">Trang tính</label><select id="xlsx-sheet" value={sheet} disabled={busy} onChange={e=>sheetChange(e.target.value)}>{sheets.map(x=><option key={x.name} value={x.name}>{x.name} · {x.rows} dòng</option>)}</select></div>
    <div className="import-hint">Ánh xạ cột Excel vào trường dữ liệu hệ thống. Chỉ trường <b>Mã căn</b> cần được ánh xạ; các trường khác có thể bỏ qua.</div>
    {ignoredExcelHeaders.length>0&&<div className="import-hint" role="status"><b>{ignoredExcelHeaders.length} cột chưa được ánh xạ sẽ không nhập:</b> {ignoredExcelHeaders.slice(0,5).join(', ')}{ignoredExcelHeaders.length>5?'…':''}. Hãy đối chiếu các cột này với bảng gốc trước khi xác nhận.</div>}
    <div className="import-map">{fields.map(f=><label key={f.value} className="import-map-row"><span>{fieldLabels[f.value]||f.value}{f.value==='code'?' *':''}</span><select value={mapping[f.value]??''} onChange={e=>{setMapping(old=>({...old,[f.value]:e.target.value}));setReport(null)}}><option value="">Không nhập</option>{headers.map((h,i)=><option key={i} value={i}>{String.fromCharCode(65+i)} · {h||'(Không có tên)'}</option>)}</select></label>)}</div>
    {sample.length>0&&<div className="import-hint"><b>Dữ liệu xem nhanh:</b> {sample.length} dòng đầu; việc xác nhận chỉ khả dụng sau khi kiểm tra trên server.</div>}
    </>}
   </>:<><div className="import-hint"><b>Cột mẫu:</b> Mã căn, Dự án, Tòa nhà, Tầng, Phòng, Nội thất, Ghi chú nội thất, Địa chỉ, Chủ sở hữu, Khách thuê, Giá thuê, Phí quản lý, Người phụ trách, Nhân viên kinh doanh, Ghi chú.</div>
    <textarea className="field-input import-textarea" value={csv} onChange={e=>{setCsv(e.target.value);setReport(null);setSuccess('')}} placeholder={'Mã căn,Dự án,Tòa nhà,Tầng,Giá thuê,Phí quản lý\nDV02-2104,Rose Town,DV02,21,9500000,"6%"'} rows={7}/></>}
   <div className="import-controls"><Btn kind="primary" disabled={busy||(mode==='xlsx'?(!file||mapping.code==null||mapping.code===''):!csv.trim())} onClick={preview}>{busy?'Đang xử lý…':'Kiểm tra dữ liệu'}</Btn>{report&&<Btn disabled={!!report.errors.length||!report.valid||busy||locked} onClick={commit}>Xác nhận nhập {report.valid} căn</Btn>}</div>
   {locked&&<div role="alert" className="aurel-reconcile-note"><Icon name="shield" size={18}/><span>{submissionLockedMessage}</span></div>}{error&&!locked&&<div role="alert" className="import-error">{error}</div>}{success&&<div role="status" className="import-success">{success}</div>}
  </fieldset></section>
  <section className="panel pad-panel import-results"><div className="eyebrow">KẾT QUẢ KIỂM TRA</div><h3>Báo cáo kiểm tra</h3>{report?<>
   <div className="import-stats"><div><strong>{report.total}</strong><small>Dòng dữ liệu</small></div><div><strong>{report.valid}</strong><small>Có thể nhập</small></div><div><strong>{report.duplicates}</strong><small>Đã tồn tại</small></div><div><strong>{report.errors.length}</strong><small>Lỗi</small></div></div>
   {!!report.errors.length&&<div className="import-messages bad"><b>Phải sửa lỗi trước khi nhập</b>{report.errors.slice(0,15).map((e,i)=><p key={i}>Dòng {e.line}: {e.message}</p>)}</div>}
   {!!report.warnings.length&&<div className="import-messages"><b>Cảnh báo</b>{report.warnings.slice(0,10).map((e,i)=><p key={i}>Dòng {e.line}: {e.message}</p>)}</div>}
   {!!report.preview.length&&<div className="import-preview"><table><thead><tr><th>Mã căn</th><th>Dự án</th><th>Giá thuê</th><th>Phí %</th></tr></thead><tbody>{report.preview.map((u,i)=><tr key={i}><td>{u.code}</td><td>{u.project||'Nháp'}</td><td>{outputMoney(u.rent)}</td><td>{u.feePercent??'—'}</td></tr>)}</tbody></table></div>}
  </>:<div className="import-placeholder"><Icon name="document" size={32}/><h4>Chưa kiểm tra dữ liệu</h4><p>Tệp chưa được đối chiếu. Chưa phát sinh thay đổi trong danh mục.</p></div>}</section>
 </div>;
}
