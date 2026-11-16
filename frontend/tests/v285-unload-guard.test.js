import test from 'node:test';
import assert from 'node:assert/strict';
import {protectPendingWork} from '../src/lib/unload-guard.js';
import {hasEditorChanges} from '../src/lib/editor-diff.js';

const unload = target => {
 const event = new Event('beforeunload', {cancelable: true});
 target.dispatchEvent(event);
 return event.defaultPrevented;
};
test('clean forms leave browser navigation unblocked', () => {
 const target = new EventTarget();
 const cleanup = protectPendingWork(target, false);
 assert.equal(unload(target), false);
 cleanup();
});
test('pending work blocks unload until cleanup after save or unmount', () => {
 const target = new EventTarget();
 const cleanup = protectPendingWork(target, true);
 assert.equal(unload(target), true);
 cleanup();
 cleanup();
 assert.equal(unload(target), false);
});
test('reverted edits remove the guard without losing numeric equivalence', () => {
 const target = new EventTarget();
 const original = {rent: 9500000};
 const fields = [{name: 'rent', type: 'number'}];
 let cleanup = protectPendingWork(target, hasEditorChanges('unit', {rent: '9600000'}, original, fields));
 assert.equal(unload(target), true);
 cleanup();
 cleanup = protectPendingWork(target, hasEditorChanges('unit', {rent: '9500000.00'}, original, fields));
 assert.equal(unload(target), false);
 cleanup();
});
