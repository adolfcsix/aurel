/**
 * AUREL source-integrity gate. No npm packages, network or database required.
 * Checks source duplication, import references, CSS load order and selected logo.
 * Does not make claims about React rendering, PostgreSQL or visual equivalence.
 */
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const expectedLogoSha='beee7e52cc28b25e3151248d80e1a620f36f667b918600c2268c024872bcef55';
const sourceDirs=['frontend/src','backend/src','scripts'];
const sourceExtensions=new Set(['.js','.jsx','.mjs','.css']);
const scriptExtensions=new Set(['.js','.jsx','.mjs']);

function walk(dir){
 const results=[];
 if(!existsSync(dir))return results;
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const absolute=path.join(dir,entry.name);
  if(entry.isDirectory())results.push(...walk(absolute));
  else if(entry.isFile())results.push(absolute);
 }
 return results;
}
export function relativeImports(content){
 const patterns=[
  /\bimport\s*['"](\.[^'"]+)['"]/gm,
  /\b(?:import|export)\s+[^;]*?\bfrom\s*['"](\.[^'"]+)['"]/gm,
  /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/gm,
  /\brequire\s*\(\s*['"](\.[^'"]+)['"]\s*\)/gm
 ];
 const imports=[];
 for(const regex of patterns){for(const match of content.matchAll(regex))imports.push({spec:match[1],offset:match.index});}
 return [...new Set(imports.sort((a,b)=>a.offset-b.offset).map(item=>item.spec))];
}
/**
 * Enumerate authored CSS blocks in cascade order, including nested @media.
 * Compare exact declarations only; differing overrides are intentionally allowed.
 * No extra CSS parser dependency is required for this release gate.
 */
export function cssLeafRules(css,context='',out=[]){
 let i=0;
 const isSpace=c=>/\s/.test(c||'');
 const skipComment=()=>{
  if(css.slice(i,i+2)!=='/*')return false;
  const end=css.indexOf('*/',i+2);
  i=end<0?css.length:end+2;
  return true;
 };
 const next=(stop)=>{
  let quote='',paren=0,square=0;
  while(i<css.length){
   if(!quote&&skipComment())continue;
   const c=css[i];
   if(quote){
    if(c==='\\'){i+=2;continue;}
    if(c===quote)quote='';i++;continue;
   }
   if(c==='"'||c==="'"){quote=c;i++;continue;}
   if(c==='(')paren++;
   else if(c===')')paren=Math.max(0,paren-1);
   else if(c==='[')square++;
   else if(c===']')square=Math.max(0,square-1);
   if(paren===0&&square===0&&stop.includes(c))return c;
   i++;
  }
  return null;
 };
 while(i<css.length){
  while(i<css.length&&(isSpace(css[i])||skipComment())){if(isSpace(css[i]))i++;}
  if(i>=css.length)break;
  const start=i,delim=next(['{',';','}']);
  if(!delim)break;
  const prelude=css.slice(start,i).trim();
  if(delim===';'||delim==='}'){i++;continue;}
  i++;const bodyStart=i;let depth=1,quote='';
  while(i<css.length&&depth){
   if(!quote&&skipComment())continue;
   const c=css[i];
   if(quote){if(c==='\\'){i+=2;continue;}if(c===quote)quote='';i++;continue;}
   if(c==='"'||c==="'"){quote=c;i++;continue;}
   if(c==='{')depth++;
   if(c==='}')depth--;
   i++;
  }
  const body=css.slice(bodyStart,i-1);
  if(/^@(media|supports|container|layer)\b/i.test(prelude)){
   cssLeafRules(body,context+'|'+prelude.replace(/\s+/g,' ').replace(/\s*\(/g,'('),out);
  }else if(!prelude.startsWith('@')&&prelude&&body.trim()&&!body.includes('{')){
   out.push({context,selector:prelude.replace(/\s+/g,' ').replace(/\s*,\s*/g,','),declarations:body.trim()});
  }
 }
 return out;
}
export function repeatedCssBlocks(layers){
 const seen=new Map(),duplicate=[];
 for(const {name,content} of layers){
  for(const rule of cssLeafRules(content)){
   const key=JSON.stringify([rule.context,rule.selector,rule.declarations]);
   if(seen.has(key))duplicate.push({first:seen.get(key),second:name,selector:rule.selector,context:rule.context});
   else seen.set(key,name);
  }
 }
 return duplicate;
}

function resolves(from,spec){
 const target=path.resolve(path.dirname(from),spec.split(/[?#]/)[0]);
 return [target,...['.js','.jsx','.mjs','.css','.json'].map(ext=>target+ext),path.join(target,'index.js'),path.join(target,'index.jsx')]
  .some(p=>existsSync(p)&&statSync(p).isFile());
}
export function inspectSource(root=projectRoot){
 const issues=[];
 const checks=[];
 const get=rel=>path.join(root,rel);
 const sourceFiles=sourceDirs.flatMap(dir=>walk(get(dir))).filter(f=>sourceExtensions.has(path.extname(f))).sort();
 const hashed=new Map(); let imports=0;
 for(const file of sourceFiles){
  const bytes=readFileSync(file),digest=createHash('sha256').update(bytes).digest('hex');
  if(hashed.has(digest))issues.push(`Identical source files: ${path.relative(root,hashed.get(digest))} and ${path.relative(root,file)}`);
  else hashed.set(digest,file);
  if(!scriptExtensions.has(path.extname(file)))continue;
  for(const spec of relativeImports(bytes.toString('utf8'))){
   imports++;
   if(!resolves(file,spec))issues.push(`Missing relative import: ${path.relative(root,file)} -> ${spec}`);
  }
 }
 checks.push({name:'Unique source bytes',count:hashed.size});
 checks.push({name:'Relative source references',count:imports});
 const entryPath=get('frontend/src/main.jsx');
 if(existsSync(entryPath)){
  const entry=readFileSync(entryPath,'utf8');
  const declared=[...entry.matchAll(/import\s+['"]\.\/(.+?\.css)['"];?/g)].map(m=>m[1]);
  const allStyles=walk(get('frontend/src')).filter(p=>p.endsWith('.css')).map(p=>path.basename(p));
  const missing=allStyles.filter(css=>!declared.includes(css));
  if(missing.length)issues.push(`Orphan CSS source: ${missing.join(', ')}`);
  if(new Set(declared).size!==declared.length)issues.push('Duplicate CSS entry imports');
  if(declared.at(-1)!=='atelier-v233.css')issues.push('Maison signature CSS must remain last');
  checks.push({name:'Active CSS layers',count:declared.length});
  const cssDuplicates=repeatedCssBlocks(declared.filter(css=>existsSync(get('frontend/src/'+css))).map(css=>({name:css,content:readFileSync(get('frontend/src/'+css),'utf8')})));
  for(const rule of cssDuplicates)issues.push(`Duplicate CSS block: ${rule.first} -> ${rule.second}: ${rule.context} ${rule.selector}`);
  checks.push({name:'Repeated exact CSS blocks',count:cssDuplicates.length});
 }
 const versions=['package.json','frontend/package.json','backend/package.json'].map(p=>({p,version:JSON.parse(readFileSync(get(p),'utf8')).version}));
 if(new Set(versions.map(x=>x.version)).size!==1)issues.push(`Package version mismatch: ${JSON.stringify(versions)}`);
 checks.push({name:'Package versions',count:versions[0].version});
 const logo=get('frontend/public/images/aurel-selected-wordmark.png');
 const actual=existsSync(logo)?createHash('sha256').update(readFileSync(logo)).digest('hex'):'missing';
 if(actual!==expectedLogoSha)issues.push(`Approved AUREL logo changed: ${actual}`);
 checks.push({name:'Approved brand SHA-256',count:actual});
 return {ok:issues.length===0,files:sourceFiles.length,checks,issues};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=inspectSource();
 for(const check of result.checks)console.log(`${result.ok?'CHECK':'AUDIT'} ${check.name}: ${check.count}`);
 for(const problem of result.issues)console.error(`FAIL ${problem}`);
 console.log(`${result.ok?'PASS':'FAIL'} Source integrity: ${result.files} source files, ${result.issues.length} issues`);
 if(!result.ok)process.exitCode=1;
}
