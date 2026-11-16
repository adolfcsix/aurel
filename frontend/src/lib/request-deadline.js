/** One deadline covers headers AND body decoding. Never retries a mutation. */
export async function withRequestDeadline(operation,{signal,timeoutMs=30000}={}){
 const controller=new AbortController();
 let timer,abort;
 const stopped=new Promise((_,reject)=>{
  abort=()=>{controller.abort(signal?.reason);reject(Object.assign(new Error('Yêu cầu đã được hủy.'),{name:'AbortError'}))};
  if(signal?.aborted){abort();return}
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{
   controller.abort();
   reject(Object.assign(new Error('Máy chủ phản hồi quá lâu. Hãy kiểm tra kết nối và tải lại dữ liệu.'),{name:'TimeoutError'}));
  },Number.isFinite(timeoutMs)&&timeoutMs>0?timeoutMs:30000);
 });
 try{
  return await Promise.race([stopped,Promise.resolve().then(()=>{
   if(controller.signal.aborted)throw Object.assign(new Error('Yêu cầu đã được hủy.'),{name:'AbortError'});
   return operation(controller.signal);
  })]);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
