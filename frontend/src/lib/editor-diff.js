/** Compare editable business fields against the persisted dossier, not against
 * the number of onChange events. Empty optional fields and numeric/select
 * string representations are equivalent; never include metadata or a hidden
 * fee-effective-date field in an ordinary dossier edit.
 *
 * This is a UX guard only. The backend still validates permissions and revision.
 */
export const dossierEditKinds=new Set(['project','building','floor','room','unit','client','staff','lease']);

const canonical=(value,field)=>{
 if(value===undefined||value===null)return '';
 if(field.type==='number'){
  if(typeof value==='string'&&!value.trim())return '';
  const n=Number(value);
  return Number.isFinite(n)?String(n):String(value);
 }
 return String(value).trim();
};

export function hasEditorChanges(kind,draft,record,fields){
 if(!record||!dossierEditKinds.has(kind))return true;
 return fields.some(field=>{
  // Fee audit metadata applies only to a substantive fee policy change.
  if(['feeEffectiveFrom','feeReason'].includes(field.name))return false;
  return canonical(draft?.[field.name],field)!==canonical(record[field.name],field);
 });
}
