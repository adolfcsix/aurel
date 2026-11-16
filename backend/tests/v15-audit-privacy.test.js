import test from 'node:test';
import assert from 'node:assert/strict';
import {log,redactAuditValue,safeAuditEntry} from '../src/domain.js';

test('V1.5: new audit snapshots redact credentials recursively without mutating the actual record',()=>{
 const db={audit:[]},actor={id:'admin',name:'Operator'};
 const before={name:'Account',passwordHash:'hash:salt',metadata:{csrf:'123',contacts:[{token:'secret',phone:'0987654321'}]}};
 const copy=structuredClone(before);
 log(db,actor,'users.update','account-1',before,{passwordHash:'new:hash',name:'Account'});
 assert.deepEqual(before,copy);
 assert.equal(db.audit[0].before.passwordHash,'[ĐÃ ẨN]');
 assert.equal(db.audit[0].before.metadata.csrf,'[ĐÃ ẨN]');
 assert.equal(db.audit[0].before.metadata.contacts[0].token,'[ĐÃ ẨN]');
 assert.equal(db.audit[0].after.passwordHash,'[ĐÃ ẨN]');
 assert.equal(db.audit[0].before.metadata.contacts[0].phone,'0987654321');
});

test('V1.5: legacy audit records are redacted again when exposed to the client',()=>{
 const old={event:'account.updated',before:{password_hash:'oldhash',session_token:'abc',clientSecret:'xyz',deep:[{access_token:'auth',apiKey:'key'}]},after:{status:'active'}};
 const safe=safeAuditEntry(old);
 assert.equal(safe.before.password_hash,'[ĐÃ ẨN]');
 assert.equal(safe.before.session_token,'[ĐÃ ẨN]');
 assert.equal(safe.before.clientSecret,'[ĐÃ ẨN]');
 assert.equal(safe.before.deep[0].access_token,'[ĐÃ ẨN]');
 assert.equal(safe.before.deep[0].apiKey,'[ĐÃ ẨN]');
 assert.equal(old.before.password_hash,'oldhash');
});

test('V1.5: audit redactor accepts empty values and arrays without exceptions',()=>{
 assert.equal(redactAuditValue(null),null);
 assert.deepEqual(redactAuditValue([{note:'ok'},null,0]),[{note:'ok'},null,0]);
});
