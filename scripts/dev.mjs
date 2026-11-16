/** Local VS Code dev runner: fail fast on missing packages and propagate errors.
 * Keep frontend/backend in one root command without orphaning watch processes.
 */
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const checkOnly=process.argv.includes('--check');
const required=[['frontend',['vite','react','react-dom']],['backend',['express']]];
const missing=required.flatMap(([folder,modules])=>{
 const resolve=createRequire(path.join(root,folder,'package.json'));
 return modules.filter(name=>{try{resolve.resolve(name);return false}catch{return true}}).map(name=>`${folder}/${name}`);
});

if(missing.length){
 console.error('AUREL chưa thể khởi động: thiếu thư viện '+missing.join(', '));
 console.error('Tại thư mục gốc, chạy: npm install --no-audit --no-fund');
 process.exitCode=2;
}else if(checkOnly){
 console.log('AUREL: đủ thư viện lõi để thử khởi chạy. Chưa xác nhận React build / API / PostgreSQL.');
}else{
 const npm=process.platform==='win32'?'npm.cmd':'npm';
 let stopping=false,live=2;
 const children=[];
 const terminate=(child)=>{
  if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;
  if(process.platform==='win32'){
   const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
   killer.on('error',()=>child.kill('SIGTERM'));
  }else{
   try{process.kill(-child.pid,'SIGTERM')}catch{child.kill('SIGTERM')}
  }
 };
 const stop=(code)=>{
  if(stopping)return;
  stopping=true;
  process.exitCode=code;
  for(const {child} of children)terminate(child);
 };
 for(const [name,workspace] of [['Backend','backend'],['Frontend','frontend']]){
  const child=spawn(npm,['run','dev','-w',workspace],{
   cwd:root,stdio:'inherit',shell:process.platform==='win32',detached:process.platform!=='win32',windowsHide:true,
  });
  children.push({name,child});
  child.on('error',error=>{console.error(`AUREL ${name} không khởi động được: ${error.message}`);stop(1)});
  child.on('exit',(code,signal)=>{
   live--;
   if(!stopping){
    console.error(`AUREL ${name} đã dừng (${signal||code}). Dừng cả hai phần để tránh trạng thái chạy dở.`);
    stop(typeof code==='number'&&code!==0?code:1);
   }
   if(live===0)process.exitCode=process.exitCode??0;
  });
 }
 process.once('SIGINT',()=>stop(130));
 process.once('SIGTERM',()=>stop(143));
}
