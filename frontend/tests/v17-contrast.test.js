import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const style=readFileSync(new URL('../src/atelier-forms.css',import.meta.url),'utf8');
function luminance(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0)}
function contrast(foreground,background){const l=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);return(l[0]+.05)/(l[1]+.05)}
test('V1.7: editorial body and secondary text contrast is at least 4.5:1 in form surfaces',()=>{
 for(const bg of ['#faf9f6','#fffdf9'])for(const fg of ['#28332b','#677168','#667168','#617063']) assert.ok(contrast(fg,bg)>=4.5,`${fg} on ${bg}`);
 assert.match(style,/\.atelier-section-head p\{[^}]*color:#667168/);
 assert.match(style,/\.atelier-editor \.field-input::placeholder\{color:#667168/);
});
