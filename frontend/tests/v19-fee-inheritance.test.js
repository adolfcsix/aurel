import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveUnitFeePercent} from '../src/lib/finance.js';

test('V1.9: empty per-unit fee inherits the current company default',()=>{
 assert.equal(effectiveUnitFeePercent('',{defaultFee:6}),6);
 assert.equal(effectiveUnitFeePercent(null,{defaultFee:3.7}),3.7);
});
test('V1.9: explicit zero and custom fees remain distinct from inheritance',()=>{
 assert.equal(effectiveUnitFeePercent(0,{defaultFee:6}),0);
 assert.equal(effectiveUnitFeePercent('0',{defaultFee:6}),0);
 assert.equal(effectiveUnitFeePercent('3.7',{defaultFee:6}),3.7);
});
test('V1.9: invalid fee does not produce an invented currency estimate',()=>{
 assert.equal(effectiveUnitFeePercent(-1,{defaultFee:6}),null);
 assert.equal(effectiveUnitFeePercent(500,{defaultFee:6}),null);
 assert.equal(effectiveUnitFeePercent('abc',{defaultFee:6}),null);
});
