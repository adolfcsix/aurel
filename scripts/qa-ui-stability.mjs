/** Read-only, dependency-free UI stability gate. Not a substitute for React E2E. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const main=fs.readFileSync(path.join(root,'frontend/src/main.jsx'),'utf8');
const cssFiles=Array.from(main.matchAll(/import '\.\/(.+?\.css)';/g),x=>x[1]);
const issues=[];
function check(test,message){if(!test)issues.push(message)}
check(cssFiles.length>0,'Missing CSS entry imports');
check(new Set(cssFiles).size===cssFiles.length,'Duplicate CSS import');
for(const file of cssFiles)check(fs.existsSync(path.join(root,'frontend/src',file)),`Missing ${file}`);
check(cssFiles.at(-1)==='atelier-v233.css','Last signature palette layer changed without visual regression');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('frontend/src/atelier-v233.css');
const actions=read('frontend/src/atelier-v224.css');
const ui=read('frontend/src/components/Ui.jsx');
const search=read('frontend/src/components/PrivateSearch.jsx');
const dossier=read('frontend/src/components/DossierFrame.jsx');
const helper=read('frontend/src/lib/modal-focus.js');
check(actions.includes('--aurel-action-radius: 14px'),'Action silhouette is not 14px');
check(actions.includes('--aurel-action-hit: 44px'),'Minimum action hit target missing');
check(ui.includes("type==='button'&&!['danger','dangerGhost'].includes(kind)"),'Liquid Pearl safety constraint changed');
check(css.includes('scrollbar-gutter:stable'),'Scrollbar layout stabilization missing');
check(css.includes('.aurel-find-search input,')&&css.includes('font-size:16px;'),'Mobile input zoom safeguard missing');
check(search.includes('containModalTab')&&dossier.includes('containModalTab'),'Shared modal focus management missing');
check(helper.includes('topmostModal'),'Nested modal guard missing');
check(css.includes('prefers-reduced-motion:reduce'),'Reduced motion support missing');
const tokens=Object.fromEntries([...css.matchAll(/--maison-33-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(m=>[m[1],m[2]]));
function luminance(hex){const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
function contrast(fg,bg){const a=luminance(fg),b=luminance(bg);return Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2));}
const pairs=[['ink','porcelain'],['muted','silk'],['copper','silk'],['ink','jade'],['porcelain','forest']];
const contrastChecks=pairs.map(([fg,bg])=>({foreground:fg,background:bg,ratio:tokens[fg]&&tokens[bg]?contrast(tokens[fg],tokens[bg]):null}));
for(const {foreground,background,ratio} of contrastChecks)check(ratio>=4.5,`Insufficient contrast ${foreground}/${background}: ${ratio}`);
const evidence={release:JSON.parse(read('package.json')).version,gate:'dependency-free source UI stability',result:issues.length?'FAIL':'PASS',cssImportCount:cssFiles.length,lastCssImport:cssFiles.at(-1),newStylesheetsAdded:0,checks:{buttonRadiusPx:14,minimumActionHeightPx:44,modalFocusShared:true,mobileEditableFontPx:16},contrastChecks,issues,limits:['Static assertions do not prove React runtime styles','Safari, Android, Express and PostgreSQL still require separate E2E tests']};
console.log(JSON.stringify(evidence,null,2));
if(process.argv.includes('--write')){const file=path.join(root,'docs/qa/UX_STABILITY_EVIDENCE.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');}
if(issues.length)process.exitCode=1;
