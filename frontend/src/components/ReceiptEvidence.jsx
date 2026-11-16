import React,{useState} from 'react';
import {apiBinary} from '../lib/http.js';
// Exposes neither disk path nor the file content in the state endpoint.
export default function ReceiptEvidence({payment,attachments=[],onUploaded}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const upload=async(e)=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(!['application/pdf','image/png','image/jpeg'].includes(file.type)){setError('Chỉ nhận PDF, PNG, JPEG');return}
  if(file.size<8){setError('Tệp không được rỗng hoặc quá ngắn (tối thiểu 8 byte).');return}
  if(file.size>4*1024*1024){setError('Tệp tối đa 4 MB');return}
  setBusy(true);setError('');let accepted=false;
  try{
   await apiBinary('/payments/'+encodeURIComponent(payment.id)+'/attachments',{body:file,headers:{'Content-Type':file.type,'X-Aurel-Filename':file.name}});
   accepted=true;
   const refreshed=await onUploaded();
   if(refreshed===false)setError('Đã lưu chứng từ nhưng chưa tải lại được danh sách. Hãy tải lại trang để đối chiếu, không tải lên lần nữa.');
  }catch(err){setError(accepted
   ?'Máy chủ đã nhận chứng từ nhưng chưa đồng bộ danh sách. Hãy tải lại để đối chiếu, không tải lên lần nữa.'
   :err.uncertain?'Chưa xác định máy chủ đã nhận chứng từ hay chưa. Hãy kiểm tra danh sách trước khi gửi lại.':err.message);
  }finally{setBusy(false)}
 };
 return <div className="evidence-cell">
  {attachments.length>0?<div className="evidence-list">{attachments.map(a=><a key={a.id} className="text-link" href={'/api/payment-attachments/'+encodeURIComponent(a.id)+'/download'} title={a.filename}>Tải {a.filename.length>21?a.filename.slice(0,18)+'…':a.filename}</a>)}</div>:<small className="muted">Chưa có tệp</small>}
  {payment.status==='posted'&&<label className="evidence-upload">{busy?'Đang lưu…':'+ Đính kèm'}<input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy} onChange={upload}/></label>}
  {error&&<small className="import-error" role="alert">{error}</small>}
 </div>;
}
