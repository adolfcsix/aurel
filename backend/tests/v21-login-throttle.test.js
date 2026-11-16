import test from 'node:test';
import assert from 'node:assert/strict';
import {LoginThrottle} from '../src/login-throttle.js';

test('V2.1 failed attempts are limited but successful logins can clear the counter',()=>{
 const t=new LoginThrottle({limit:3,windowMs:1000});
 t.assertAllowed('a',100);
 t.recordFailure('a',100);t.recordFailure('a',200);t.recordFailure('a',300);
 assert.throws(()=>t.assertAllowed('a',301),error=>error.status===429);
 t.assertAllowed('b',301);
 t.clear('a');t.assertAllowed('a',301);
});
test('V2.1 stale attempts expire and rotating IPs cannot grow the map without bound',()=>{
 const t=new LoginThrottle({limit:2,windowMs:100,maxKeys:2});
 t.recordFailure('first',0);t.recordFailure('second',10);
 t.recordFailure('third',20);assert.ok(t.failures.size<=2);
 t.assertAllowed('first',200);t.recordFailure('first',200);
 assert.equal(t.recent('first',200).length,1);
});
