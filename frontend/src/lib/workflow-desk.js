/** AUREL V2.18: read-only task grouping. Never invents financial state. */
export const PROPOSAL_STAGES = Object.freeze([
 {id:'pending',label:'Chờ phê duyệt',note:'Quản lý kiểm tra và quyết định đề nghị'},
 {id:'approved',label:'Chờ xác nhận chi',note:'Kế toán đối chiếu chứng từ thực chi'},
 {id:'history',label:'Lịch sử xử lý',note:'Đã chi, từ chối hoặc kết thúc xử lý'}
]);
export function depositProposalStage(proposal){
 if(proposal?.status==='pending')return 'pending';
 if(proposal?.status==='approved')return 'approved';
 return 'history';
}
export function groupDepositProposals(proposals=[]){
 const grouped={pending:[],approved:[],history:[]};
 for(const item of proposals||[])grouped[depositProposalStage(item)].push(item);
 for(const key of Object.keys(grouped))grouped[key].reverse();
 return grouped;
}
export const proposalStatusText=status=>({pending:'Chờ phê duyệt',approved:'Đã duyệt · chờ chi',rejected:'Đã từ chối',executed:'Đã chi · đã quyết toán'})[status]||'Trạng thái chưa xác định';
export function proposalActions(proposal,user,can=()=>false){
 if(!proposal||!user)return {approve:false,reject:false,execute:false};
 const separateMaker=proposal.createdBy!==user.id;
 return {
  approve:proposal.status==='pending'&&separateMaker&&can('deposit.approve'),
  reject:['pending','approved'].includes(proposal.status)&&can('deposit.approve'),
  execute:proposal.status==='approved'&&separateMaker&&proposal.approvedBy!==user.id&&can('deposit.execute')
 };
}
export const LEASE_STAGES=Object.freeze([
 {id:'draft',label:'Chờ hoàn thiện',note:'Hồ sơ có thể bổ sung trước khi kích hoạt'},
 {id:'expired',label:'Cần đối soát',note:'Thời hạn đã qua nhưng trạng thái còn hiệu lực'},
 {id:'expiring',label:'Sắp hết hạn',note:'Trong 30 ngày tới, cần xem xét gia hạn'},
 {id:'active',label:'Đang hiệu lực',note:'Theo dõi vận hành và kỳ thanh toán'},
 {id:'ended',label:'Đã kết thúc',note:'Giữ nguyên lịch sử hợp đồng'}
]);
/** Date-only UTC arithmetic; no locale/timezone shift for contract boundaries. */
export function leaseDaysRemaining(date,today){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{4}-\d{2}-\d{2}$/.test(today||''))return null;
 const a=Date.parse(date+'T00:00:00Z'),b=Date.parse(today+'T00:00:00Z');
 const valid=(value,epoch)=>Number.isFinite(epoch)&&new Date(epoch).toISOString().slice(0,10)===value;
 return valid(date,a)&&valid(today,b)?Math.round((a-b)/86400000):null;
}
export function leaseStage(lease,today){
 if(lease.status==='draft')return 'draft';
 if(lease.status==='ended')return 'ended';
 if(lease.status!=='active')return 'ended';
 const days=leaseDaysRemaining(lease.endsOn,today);
 if(days!==null&&days<0)return 'expired';
 if(days!==null&&days<=30)return 'expiring';
 return 'active';
}
export function groupLeases(leases=[],today){
 const grouped={draft:[],expired:[],expiring:[],active:[],ended:[]};
 for(const lease of leases||[])grouped[leaseStage(lease,today)].push(lease);
 for(const key of Object.keys(grouped)){
  grouped[key].sort((a,b)=>String(a.endsOn||'9999').localeCompare(String(b.endsOn||'9999')));
 }
 return grouped;
}
