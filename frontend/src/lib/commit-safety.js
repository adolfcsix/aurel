/** AUREL V2.20 — request outcome and freshness policy (client advisory only).
 * Authorization, transactionality and idempotency remain server responsibilities.
 */
export const WRITE_METHODS=new Set(['POST','PATCH','PUT','DELETE']);
export const isWriteMethod=method=>WRITE_METHODS.has(String(method||'GET').toUpperCase());
export const isOutcomeUncertain=error=>Boolean(error?.uncertain===true);
export const isWriteBlocked=({loadError='',verificationRequired=false,editConflict=false}={})=>
 Boolean(loadError||verificationRequired||editConflict);
export function blockedWriteMessage({loadError='',verificationRequired=false,editConflict=false}={}){
 if(verificationRequired)return 'Kết quả thao tác trước chưa được xác minh. Hãy tải lại, đối chiếu hồ sơ và xác nhận đã kiểm tra trước khi thực hiện tiếp.';
 if(loadError)return 'Dữ liệu chưa được đồng bộ với máy chủ. Hãy tải lại trước khi ghi nhận thay đổi.';
 if(editConflict)return 'Hồ sơ đã thay đổi ở phiên khác. Bản nhập vẫn được giữ để tham khảo; hãy đóng và mở lại hồ sơ trước khi lưu.';
 return '';
}
export function acknowledgedWriteNotice({refreshed,success='Đã ghi nhận thay đổi.'}={}){
 return refreshed?{message:success,error:false}:{
  message:'Máy chủ đã xác nhận thao tác, nhưng chưa tải lại được dữ liệu. Không thực hiện lại; hãy đồng bộ và kiểm tra hồ sơ.',error:true
 };
}
export const uncertainWriteNotice='Chưa xác định được máy chủ đã ghi nhận thao tác hay chưa. Không gửi lại lệnh. Hãy tải lại và đối chiếu sổ giao dịch trước khi tiếp tục.';

/** Secure UUID for browsers where randomUUID is unavailable on local HTTP.
 * getRandomValues remains available in older mobile browsers and non-secure LAN contexts.
 * Never fall back to Math.random for a financial idempotency key.
 */
export function uuidV4FromBytes(input){
 if(!(input instanceof Uint8Array)||input.length!==16)throw new TypeError('UUID requires 16 random bytes');
 const bytes=Uint8Array.from(input);bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function secureRequestKey(cryptoSource=globalThis.crypto){
 if(typeof cryptoSource?.randomUUID==='function')return cryptoSource.randomUUID();
 if(typeof cryptoSource?.getRandomValues==='function')return uuidV4FromBytes(cryptoSource.getRandomValues(new Uint8Array(16)));
 throw new Error('Trình duyệt chưa hỗ trợ tạo mã giao dịch an toàn. Hãy sử dụng kết nối HTTPS hoặc trình duyệt mới hơn.');
}
