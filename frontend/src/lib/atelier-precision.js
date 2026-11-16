/** AUREL Atelier / 2.19 — presentation-only helpers.
 * Data must already be filtered by the API for the viewer's permissions.
 * No additional personal attributes are joined into a search result.
 */
export function normalizeVietnamese(value=''){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLocaleLowerCase('vi').trim();
}
/** Refines an already-authorized proposal list, without altering it. */
export function filterProposalDesk(rows=[], units=[], users=[], query=''){
 const needle=normalizeVietnamese(query);
 if(!needle)return [...rows];
 const codeById=new Map(units.map(unit=>[unit.id,unit.code||'']));
 const nameById=new Map(users.map(user=>[user.id,user.name||'']));
 return rows.filter(row=>normalizeVietnamese([
  codeById.get(row.unitId)||'',
  row.createdByName||nameById.get(row.createdBy)||'',
  // Status text is shown in the same language as the workbench.
  ({pending:'Chờ phê duyệt',approved:'Đã duyệt, chờ xác nhận chi',rejected:'Đã từ chối',executed:'Đã chi, đã quyết toán'})[row.status]||''
 ].join(' ')).includes(needle));
}
/** Avoid rendering hundreds of full cards and keep a stable, visible limit. */
export function firstPage(rows=[], visibleCount=6){
 const count=Number.isInteger(visibleCount)&&visibleCount>0?visibleCount:6;
 return rows.slice(0,count);
}
