/**
 * Short-lived, server-authenticated preview acknowledgement.
 * The commit endpoint MUST still revalidate the entire dataset in the same
 * transaction: this token proves that a given authenticated user previewed
 * these exact bytes/mapping, not that the data is guaranteed to be unchanged.
 */
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {fail} from './domain.js';
const key=randomBytes(32); // Deliberately ephemeral; previews expire on API restart.
const TTL=15*60*1000;
const signer=value=>createHmac('sha256',key).update(value).digest('hex');
export function makeImportConfirmation(userId,digestValue,now=Date.now()){
 if(typeof userId!=='string'||!userId||!/^[a-f0-9]{64}$/.test(digestValue))fail('Không thể xác nhận dữ liệu nhập');
 const payload=Buffer.from(JSON.stringify({v:1,u:userId,d:digestValue,t:now})).toString('base64url');
 return `${payload}.${signer(payload)}`;
}
export function assertImportConfirmation(userId,digestValue,previewToken,now=Date.now()){
 if(typeof previewToken!=='string'||!previewToken||previewToken.length>1024)fail('Cần kiểm tra dữ liệu trước khi xác nhận nhập',409);
 const parts=previewToken.split('.');
 if(parts.length!==2||parts[1].length!==64)fail('Mã xem trước không hợp lệ',409);
 const signature=Buffer.from(parts[1],'hex'),expected=Buffer.from(signer(parts[0]),'hex');
 if(signature.length!==expected.length||!timingSafeEqual(signature,expected))fail('Mã xem trước không hợp lệ',409);
 let body;try{body=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'))}catch{fail('Mã xem trước không hợp lệ',409)}
 if(body.v!==1||body.u!==userId||body.d!==digestValue||!Number.isSafeInteger(body.t)||now<body.t||now-body.t>TTL)fail('Bản xem trước đã hết hạn hoặc dữ liệu đã thay đổi. Vui lòng kiểm tra lại.',409);
 return true;
}
