import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inputKind,inputAttributes,passwordMeetsActivationPolicy,passwordScore} from '../src/lib/atelier-fields.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,'src',file),'utf8');

test('activation policy matches backend: 12–128 characters, letters and digits required',()=>{
 assert.equal(passwordMeetsActivationPolicy('abcdefghijK9'),true);
 assert.equal(passwordMeetsActivationPolicy('abcdefghijkL'),false);
 assert.equal(passwordMeetsActivationPolicy('123456789012'),false);
 assert.equal(passwordMeetsActivationPolicy('aB7'),false);
 assert.equal(passwordMeetsActivationPolicy('a1'.repeat(65)),false);
 assert.equal(passwordMeetsActivationPolicy(null),false);
});
test('password meter stays a presentation aid, not the validation gate',()=>{
 assert.equal(passwordScore('ABCDEFGHIJK!'),2);
 assert.equal(passwordMeetsActivationPolicy('ABCDEFGHIJK!'),false);
 assert.equal(read('components/AuthPortal.jsx').includes('if(!passwordMeetsActivationPolicy(newPassword))'),true);
});
test('semantic email and phone fields use correct mobile keyboards',()=>{
 assert.equal(inputKind({name:'email'}),'email');
 assert.equal(inputKind({name:'phone'}),'tel');
 assert.equal(inputAttributes({name:'email'}).autoComplete,'email');
 assert.equal(inputAttributes({name:'phone'}).inputMode,'tel');
 assert.equal(inputKind({name:'feePercent',type:'number'}),'number');
});
test('sensitive password fields use new-password autocomplete except old password',()=>{
 assert.equal(inputAttributes({name:'newPassword'}).autoComplete,'new-password');
 assert.equal(inputAttributes({name:'temporaryPassword'}).autoComplete,'new-password');
 assert.equal(inputAttributes({name:'currentPassword'}).autoComplete,'current-password');
});
test('nonmandatory fields are not cluttered by redundant repeated hints',()=>{
 const ui=read('components/Ui.jsx');
 assert.match(ui,/const description=field\.help\|\|''/);
 assert.match(ui,/aria-describedby/);
 assert.match(ui,/htmlFor=\{id\}/);
});
test('data grid has a keyboard-readable horizontal-scroll region',()=>{
 assert.match(read('components/Ui.jsx'),/className="table-frame" tabIndex=\{0\} role="region"/);
});
test('mobile drawer is inert when closed and behaves like a modal when open',()=>{
 const app=read('App.jsx');
 assert.match(app,/inert=\{isMobile&&!open\}/);
 assert.match(app,/aria-expanded=\{mobileOpen\}/);
 assert.match(app,/role=\{isMobile&&open\?'dialog':undefined\}/);
 assert.match(app,/event\.key==='Escape'/);
 assert.match(app,/document\.body\.style\.overflow='hidden'/);
 assert.match(app,/previous\.focus\(\{preventScroll:true\}\)/);
});
test('small interaction targets and reduced motion styles are present',()=>{
 const css=read('atelier-v222.css');
 assert.match(css,/min-height:44px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/max-width:360px/);
 assert.match(css,/\.data-grid td \{font-size:12\.5px/);
});
test('no duplicate UI entrypoint stylesheets',()=>{
 const main=read('main.jsx');
 assert.equal(main.match(/atelier-v222\.css/g)?.length,1);
});
test('finance and database runtime schemas remain untouched by the design patch',()=>{
 assert.equal(inputAttributes({name:'amount',type:'number'}).type,'number');
 assert.equal(inputAttributes({name:'leaseEnd',type:'date'}).type,'date');
 assert.equal(inputAttributes({name:'ownerId',type:'select'}).type,'select');
});
