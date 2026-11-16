import {bill,balance,dmy,money,isoToday} from './finance.js';
import {findDossierRow} from './dossier-id.js';

/** Read-only preview of a pending mutation. This does not replace server checks. */
export const requiresReview=(kind,draft)=>['payment','deposit-receive','deposit-settle','fee','renew'].includes(kind)||(kind==='lease'&&draft.status==='active');
const positiveVnd=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const nonnegativeVnd=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0;
const amount=value=>money(Number(value)||0);
// Validate the calendar date, not only its YYYY-MM-DD shape. Keep review
// consistent with server-side finance rules; the backend remains authoritative.
const validDate=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&
 !Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const row=(label,value)=>({label,value:String(value??'—')});
export function transactionReview(kind,draft,{data,record,context}={}){
 const details=[],errors=[],asOf=context?.asOf||isoToday();let title='Kiểm tra trước khi ghi nhận',note='Thông tin sẽ được kiểm tra lại tại máy chủ trước khi lưu.',action='Xác nhận';
 const add=(label,value)=>details.push(row(label,value));
 if(kind==='payment'){
  const schedule=context?.schedule;
  const remaining=schedule?bill(data,schedule).left:0;
  title='Kiểm tra khoản tiền thuê';action='Ghi nhận khoản thu';
  note='Ghi nhận vào sổ thu tiền thuê. Nếu cần điều chỉnh, giao dịch sẽ được đảo bằng chứng từ và giữ lại trong lịch sử.';
  add('Căn hộ',findDossierRow(data?.units,schedule?.unitId)?.code||'Chưa xác định');
  add('Kỳ thanh toán',schedule?.period||'—');add('Còn phải thu trước giao dịch',money(remaining));
  add('Số tiền thực nhận',amount(draft.amount));add('Ngày nhận',dmy(draft.date));add('Phương thức',draft.method||'—');
  if(draft.reference?.trim())add('Mã tham chiếu',draft.reference.trim());
  if(!schedule||schedule.status!=='open')errors.push('Kỳ thu không còn mở hoặc chưa được xác định.');
  if(!positiveVnd(draft.amount))errors.push('Số tiền thực nhận phải là số nguyên VND lớn hơn 0.');
  if(schedule&&Number(draft.amount)>remaining)errors.push('Khoản thu không được vượt số tiền còn phải thu.');
  if(!validDate(draft.date))errors.push('Cần chọn ngày thực nhận hợp lệ.');
  else if(draft.date>asOf)errors.push('Ngày thực nhận không được ở tương lai.');
 } else if(kind==='deposit-receive'){
  const lease=context?.lease;title='Kiểm tra khoản tiền cọc';action='Ghi nhận tiền cọc';
  note='Tiền cọc được ghi riêng, không tính là doanh thu tiền thuê.';
  add('Căn hộ',findDossierRow(data?.units,lease?.unitId)?.code||'Chưa xác định');
  add('Số dư cọc trước giao dịch',lease?money(balance(data,lease.id)):'—');
  add('Tiền cọc nhận thêm',amount(draft.amount));
  if(!lease)errors.push('Không tìm thấy hợp đồng để ghi nhận tiền cọc.');
  else if(!['active','draft'].includes(lease.status))errors.push('Không được nhận thêm cọc cho hợp đồng đã kết thúc.');
  if(lease&&(data?.depositSettlements||[]).some(p=>String(p.leaseId)===String(lease.id)&&['pending','approved'].includes(p.status)))
   errors.push('Đang có đề nghị hoàn cọc chờ xử lý; không thể nhận thêm cọc.');
  if(!positiveVnd(draft.amount))errors.push('Tiền cọc phải là số nguyên VND lớn hơn 0.');
 } else if(kind==='deposit-settle'){
  const lease=context?.lease,held=lease?balance(data,lease.id):0;
  const refund=Number(draft.refund),deduction=Number(draft.deduction);
  title='Kiểm tra đề nghị hoàn cọc';action='Gửi đề nghị phê duyệt';
  note='Đây chỉ là đề nghị. Tiền chưa được chi và số dư chưa bị trừ; hệ thống yêu cầu phê duyệt và xác nhận chi riêng.';
  add('Căn hộ',findDossierRow(data?.units,lease?.unitId)?.code||'Chưa xác định');
  add('Số dư đang giữ',money(held));add('Khoản đối trừ',amount(draft.deduction));add('Khoản đề nghị hoàn',amount(draft.refund));
  add('Số dư dự kiến còn lại',money(held-refund-deduction));
  if(!lease)errors.push('Không tìm thấy hợp đồng cần quyết toán.');
  else if(lease.status!=='ended')errors.push('Chỉ đề nghị hoàn cọc khi hợp đồng đã kết thúc.');
  if(lease&&(data?.depositSettlements||[]).some(p=>String(p.leaseId)===String(lease.id)&&['pending','approved'].includes(p.status)))
   errors.push('Đã có đề nghị hoàn cọc đang xử lý cho hợp đồng này.');
  if(deduction>0&&String(draft.note||'').trim().length<5)errors.push('Cần nêu căn cứ đối trừ ít nhất 5 ký tự.');
  if(!nonnegativeVnd(draft.deduction)||!nonnegativeVnd(draft.refund))errors.push('Khoản hoàn và đối trừ phải là số nguyên VND không âm.');
  if(refund+deduction<=0)errors.push('Tổng số tiền hoàn và đối trừ phải lớn hơn 0.');
  if(refund+deduction>held)errors.push('Tổng hoàn và đối trừ vượt số dư cọc đang giữ.');
 } else if(kind==='fee'){
  title='Kiểm tra thay đổi phí quản lý';action='Lưu tỷ lệ phí';
  note='Các kỳ đã chốt và có giao dịch vẫn giữ nguyên lịch sử. Backend quyết định kỳ nào được áp dụng chính sách mới.';
  add('Căn hộ',record?.code||'—');add('Tỷ lệ mới',draft.feePercent===''?'Kế thừa mặc định':`${draft.feePercent??'—'}%`);
  add('Cơ sở tính',draft.feeBasis==='paid'?'Theo thực thu':'Theo phát sinh');add('Áp dụng từ ngày',dmy(draft.feeEffectiveFrom));
  if(draft.feePercent!==''&&draft.feePercent!=null&&(!Number.isFinite(Number(draft.feePercent))||Number(draft.feePercent)<0||Number(draft.feePercent)>100))errors.push('Tỷ lệ phí phải nằm trong khoảng 0–100%.');
  if(!validDate(draft.feeEffectiveFrom))errors.push('Cần nhập ngày có hiệu lực hợp lệ.');
  else if(draft.feeEffectiveFrom<asOf)errors.push('Không thể thay đổi phí có hiệu lực hồi tố.');
 } else if(kind==='renew'||(kind==='lease'&&draft.status==='active')){
  const renewal=kind==='renew';title=renewal?'Kiểm tra điều khoản gia hạn':'Kiểm tra hợp đồng trước khi kích hoạt';
  action=renewal?'Xác nhận gia hạn':'Kích hoạt hợp đồng';
  note='Việc kích hoạt hoặc gia hạn có thể ảnh hưởng các kỳ thu tương lai. Những giao dịch đã ghi nhận vẫn được bảo toàn.';
  add('Căn hộ',findDossierRow(data?.units,renewal?context?.lease?.unitId:draft.unitId)?.code||'Chưa chọn');
  add('Thời hạn',`${dmy(draft.startsOn)} – ${dmy(draft.endsOn)}`);
  add('Tiền thuê mỗi kỳ',amount(draft.rent));add('Ngày thu hằng tháng',draft.paymentDay||'—');
  if(!renewal)add('Tiền cọc thỏa thuận',amount(draft.depositExpected));
  if(!validDate(draft.startsOn)||!validDate(draft.endsOn)||draft.startsOn>draft.endsOn)
   errors.push('Thời hạn hợp đồng phải có ngày bắt đầu không sau ngày kết thúc.');
  if(renewal&&context?.lease?.endsOn&&validDate(draft.startsOn)&&draft.startsOn<=context.lease.endsOn)
   errors.push('Kỳ gia hạn phải bắt đầu sau ngày kết thúc hợp đồng hiện tại.');
  if(draft.rent===''||draft.rent==null||!nonnegativeVnd(draft.rent))errors.push('Cần nhập giá thuê là số nguyên VND không âm để kích hoạt hoặc gia hạn hợp đồng.');
  if(!renewal&&!draft.unitId)errors.push('Cần chọn căn hộ trước khi kích hoạt hợp đồng.');
  if(!renewal&&!nonnegativeVnd(draft.depositExpected))errors.push('Tiền cọc thỏa thuận phải là số nguyên VND không âm.');
  if(!Number.isInteger(Number(draft.paymentDay))||Number(draft.paymentDay)<1||Number(draft.paymentDay)>31)errors.push('Ngày thu hằng tháng phải từ 1 đến 31.');
 }
 return {title,action,note,details,errors,valid:errors.length===0};
}
