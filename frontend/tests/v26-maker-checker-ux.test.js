import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const desk=readFileSync(new URL('../src/lib/workflow-desk.js',import.meta.url),'utf8');

test('V2.6: desktop and mobile hide deposit execution from its approver',()=>{
 assert.match(app,/ApprovalWorkbench/);
 assert.match(desk,/proposal.approvedBy!==user.id&&can\('deposit.execute'\)/);
 assert.match(desk,/separateMaker/);
});

test('V2.6: portfolio footer no longer carries a stale release number',()=>{
 assert.doesNotMatch(app,/Workspace · V2\.0/);
 assert.match(app,/Dữ liệu và hành động theo quyền người dùng/);
});
