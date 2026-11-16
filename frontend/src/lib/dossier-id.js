/** Canonical dossier ID comparison for imported records and API projections.
 * Non-empty persisted IDs only; names and labels are never used as keys.
 */
export function sameDossierId(left,right){
 if(left===null||left===undefined||right===null||right===undefined)return false;
 if((typeof left==='number'&&!Number.isFinite(left))||(typeof right==='number'&&!Number.isFinite(right)))return false;
 const a=String(left).trim(),b=String(right).trim();
 return a.length>0&&b.length>0&&a===b;
}
export function findDossierRow(rows,id){
 if(!Array.isArray(rows)||id===null||id===undefined)return null;
 return rows.find(row=>sameDossierId(row?.id,id))||null;
}
export function dedupeDossierRows(rows=[]){
 const used=new Set();
 return rows.filter(row=>{const id=row?.id==null?'':String(row.id).trim();if(!id||used.has(id))return false;used.add(id);return true});
}
