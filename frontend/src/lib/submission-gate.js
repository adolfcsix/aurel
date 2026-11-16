/** An irreversible per-form commit boundary until the form is discarded.
 * The transport cannot tell whether a timed-out mutation committed.
 * Do not let a refresh/acknowledgment turn that SAME form back into a retry.
 * This is UX defence in depth; the API remains authoritative.
 */
export function createSubmissionGate(){
 let phase='idle';
 return Object.freeze({
  get phase(){return phase},
  begin(){if(phase!=='idle')return false;phase='sending';return true},
  confirmed(){if(phase!=='sending')throw Error('No pending submission');phase='confirmed'},
  uncertain(){if(phase!=='sending')throw Error('No pending submission');phase='uncertain'},
  rejected(){if(phase==='sending')phase='idle'},
  nextAfterRefresh(){if(phase!=='confirmed')return false;phase='idle';return true},
  get locked(){return phase==='uncertain'||phase==='confirmed'||phase==='sending'}
 });
}
export const submissionLockedMessage='Thao tác này đã gửi và cần được đối chiếu. Không gửi lại từ biểu mẫu hiện tại. Hãy tải lại dữ liệu, kiểm tra lịch sử và mở phiên xử lý mới.';
