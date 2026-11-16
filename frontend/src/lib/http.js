/** REST client shared by every React feature.
 * CSRF, same-origin cookies and content-type are applied even when a caller
 * adds custom request headers. No endpoint should bypass this boundary.
 */
import {isWriteMethod} from './commit-safety.js';
import {withRequestDeadline} from './request-deadline.js';

let csrfToken='';
const transportError=(cause,method)=>Object.assign(new Error(isWriteMethod(method)?'Chưa thể xác minh kết quả thao tác. Cần tải lại và đối chiếu dữ liệu.':cause?.name==='TimeoutError'?cause.message:'Không thể kết nối máy chủ. Vui lòng thử tải lại.'),{code:cause?.name==='TimeoutError'?'REQUEST_TIMEOUT':'NETWORK_ERROR',uncertain:isWriteMethod(method),cause});
const responseError=(response,result,method)=>Object.assign(new Error(typeof result?.error==='string'?result.error:'Không thể thực hiện yêu cầu'),{status:response.status,uncertain:isWriteMethod(method)&&response.status>=500});
const parseJson=async(response,method)=>{try{return await response.json()}catch(cause){if(response.ok)throw Object.assign(new Error('Máy chủ trả về dữ liệu không hợp lệ. Hãy tải lại và kiểm tra trạng thái trước khi tiếp tục.'),{code:'INVALID_RESPONSE',uncertain:isWriteMethod(method),cause});return {}}};
export const setCsrf=(token)=>{csrfToken=token||''};

async function request(path,options,{signal,timeoutMs}={}){
 try{return await withRequestDeadline(async requestSignal=>{
  let response;
  try{response=await fetch('/api'+path,{...options,signal:requestSignal})}
  catch(cause){throw transportError(cause,options.method)}
  const result=await parseJson(response,options.method);
  if(!response.ok)throw responseError(response,result,options.method);
  return result;
 },{signal,timeoutMs})}catch(error){
  if(error?.name==='TimeoutError'||error?.name==='AbortError')throw transportError(error,options.method);
  throw error;
 }
}

export async function api(path,{method='GET',body,headers:customHeaders={},signal,timeoutMs,...rest}={}){
 const hasBody=body!==undefined;
 const headers={
  ...(hasBody?{'Content-Type':'application/json'}:{}),
  ...customHeaders,
  ...(!['GET','HEAD','OPTIONS'].includes(method.toUpperCase())&&csrfToken?{'X-CSRF-Token':csrfToken}:{})
 };
 return request(path,{
  ...rest,method,credentials:'same-origin',headers,
  ...(hasBody?{body:JSON.stringify(body)}:{})
 },{signal,timeoutMs});
}

export async function apiBinary(path,{method='POST',body,headers:customHeaders={},signal,timeoutMs}={}){
 const headers={
  'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ...customHeaders,
  ...(!['GET','HEAD','OPTIONS'].includes(method.toUpperCase())&&csrfToken?{'X-CSRF-Token':csrfToken}:{})
 };
 return request(path,{method,body,credentials:'same-origin',headers},{signal,timeoutMs});
}
