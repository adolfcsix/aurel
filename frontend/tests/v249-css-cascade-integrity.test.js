import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cssLeafRules,repeatedCssBlocks,inspectSource} from '../../scripts/qa-source-integrity.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

test('V2.49 keeps zero repeated exact CSS blocks across all active Maison layers',()=>{
 const entry=readFileSync(path.join(root,'frontend/src/main.jsx'),'utf8');
 const filenames=[...entry.matchAll(/import\s+['"]\.\/(.+?\.css)['"]/g)].map(match=>match[1]);
 assert.equal(filenames.length,21,'Do not merge cascade layers without React visual acceptance');
 const repeated=repeatedCssBlocks(filenames.map(name=>({name,content:readFileSync(path.join(root,'frontend/src',name),'utf8')})));
 assert.deepEqual(repeated,[]);
 assert.equal(inspectSource(root).ok,true);
});

test('V2.49 detects repeated declarations even when they occur in separate CSS files',()=>{
 const result=repeatedCssBlocks([
  {name:'first.css',content:'.a {color:red;} .b{display:grid}'},
  {name:'second.css',content:'.a {color:red;}'}
 ]);
 assert.equal(result.length,1);
 assert.equal(result[0].first,'first.css');
 assert.equal(result[0].second,'second.css');
 assert.equal(result[0].selector,'.a');
});

test('V2.49 detects repeat rules in the same media scope but preserves different breakpoints',()=>{
 const result=repeatedCssBlocks([
  {name:'first.css',content:'@media (max-width:700px){.card{display:block}}'},
  {name:'second.css',content:'@media (max-width:700px){.card{display:block}}'},
  {name:'third.css',content:'@media (min-width:701px){.card{display:block}}'}
 ]);
 assert.equal(result.length,1);
 assert.match(result[0].context,/media/);
 assert.equal(result[0].second,'second.css');
});

test('V2.49 preserves meaningful cascading overrides and ignores keyframe internals',()=>{
 const layers=[
  {name:'base.css',content:'.button{border-radius:4px;} @keyframes move {from {opacity:0} to {opacity:1}}'},
  {name:'maison.css',content:'.button{border-radius:14px;} @media(max-width:600px){.button{border-radius:10px;}}'}
 ];
 assert.deepEqual(repeatedCssBlocks(layers),[]);
});

test('V2.49 parses escaped braces and comments in CSS declarations without adding spurious rules',()=>{
 const rules=cssLeafRules('/* { bogus } */ .a:before{ content:"text with } brace"; color:green; } @media(max-width:700px){ .b{display:block;} }');
 assert.equal(rules.length,2);
 assert.equal(rules[0].selector,'.a:before');
 assert.equal(rules[1].selector,'.b');
});
