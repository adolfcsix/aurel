/** Backward-compatible unit-specific façade over the shared dossier revisions. */
import {recordRevision,assertRecordRevision,bumpRecordRevision} from './record-revisions.js';
export const unitRevision=recordRevision;
export const assertUnitRevision=(unit,expected)=>assertRecordRevision(unit,expected,'Căn hộ');
export const bumpUnitRevision=bumpRecordRevision;
