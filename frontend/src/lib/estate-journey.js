import {bill} from './finance.js';
import {sameDossierId} from './dossier-id.js';

/** Read-only dossier navigation derived from the same state as the ledger. */
export function estateJourney(unit,data,{showFinancial=true,can=()=>false}={}){
 const leases=(data.leases||[]).filter(l=>sameDossierId(l.unitId,unit.id)&&l.status!=='archived');
 const active=leases.find(l=>l.status==='active');
 const draftLease=leases.find(l=>l.status==='draft');
 const unfinished=(data.schedules||[]).filter(s=>sameDossierId(s.unitId,unit.id)&&s.status==='open').map(s=>bill(data,s)).filter(s=>s.left>0).sort((a,b)=>(a.dueOn||'').localeCompare(b.dueOn||''));
 const due=unfinished[0];
 const stages=[
  {tab:'overview',number:'01',label:'Hồ sơ căn hộ',status:unit.code?'Đã tạo hồ sơ':'Cần bổ sung định danh'},
  {tab:'lease',number:'02',label:'Hợp đồng thuê',status:active?'Đang hiệu lực':leases.some(l=>l.status==='draft')?'Có bản nháp':leases.length?'Đã kết thúc':'Chưa có hợp đồng'}
 ];
 if(showFinancial)stages.push({tab:'finance',number:'03',label:'Thanh toán',status:due?'Có kỳ cần thu':(data.schedules||[]).some(s=>sameDossierId(s.unitId,unit.id))?'Đã có lịch thu':'Chưa có kỳ thu'});
 let next=null;
 if(!active&&can('lease.write'))next={label:draftLease?'Tiếp tục hoàn thiện hợp đồng':'Tạo hợp đồng thuê',hint:draftLease?'Mở bản nháp hiện có để bổ sung điều khoản trước khi kích hoạt.':'Liên kết điều khoản thuê với căn hộ trước khi ghi nhận kỳ thu.',tab:'lease',action:draftLease?'edit-lease':'lease',record:draftLease};
 else if(due&&showFinancial&&can('payment.write'))next={label:'Ghi nhận kỳ thu đến hạn',hint:`Kỳ ${due.period} còn phải thu và chưa được tất toán.`,tab:'finance',action:'payment',schedule:due};
 else if(active)next={label:'Xem lịch hợp đồng',hint:'Theo dõi điều khoản, thời hạn và các kỳ thanh toán liên quan.',tab:'lease'};
 else if(leases.length)next={label:'Xem hồ sơ hợp đồng',hint:'Các hợp đồng đã có vẫn có thể tra cứu theo quyền truy cập.',tab:'lease'};
 else next={label:'Xem hồ sơ',hint:'Thông tin tài sản có thể được bổ sung khi có dữ liệu mới.',tab:'overview'};
 return {stages,next};
}
