/** Read-only view model for a client dossier. Never infer contract identity by name. */
import {clientUnitLinks,clientLeaseLinks} from './dossier-relations.js';
import {sameDossierId,findDossierRow} from './dossier-id.js';

export function clientProfileView(data,client){
 const linked=clientUnitLinks(data,client?.id);
 const {verified,related}=clientLeaseLinks(data,client?.id);
 const projectIds=new Set(linked.all.map(unit=>unit.projectId).filter(id=>id!==null&&id!==undefined&&String(id).trim()).map(id=>String(id).trim()));
 const channels=[client?.phone?.trim(),client?.email?.trim()].filter(Boolean);
 return {
  linked,verified,possible:related,
  projectCount:projectIds.size,
  hasContact:channels.length>0,
  hasNotes:Boolean(client?.notes?.trim()),
  sections:[{key:'contact',label:'Thông tin'},{key:'properties',label:'Tài sản'},{key:'matching',label:'Hợp đồng'}]
 };
}

/** Avoid building URLs from untrusted data without checking their formats. */
export function clientContactLink(kind,value){
 const raw=String(value||'').trim();
 if(kind==='phone'){
  // Plain telephone numbers; not arbitrary URI schemes or service strings.
  if(!/^\+?[\d\s().-]{8,30}$/.test(raw))return null;
  const number=raw.replace(/[\s().-]/g,'');
  return /^\+?\d{8,16}$/.test(number)?`tel:${number}`:null;
 }
 if(kind==='email'){
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(raw)||raw.length>160)return null;
  return `mailto:${raw}`;
 }
 return null;
}

export function unitRelationLabel(unit,linked){
 const roles=[];
 if(linked.owned.some(u=>sameDossierId(u.id,unit.id)))roles.push('Sở hữu');
 if(linked.rented.some(u=>sameDossierId(u.id,unit.id)))roles.push('Đang thuê');
 return roles.join(' · ')||'Căn hộ liên quan';
}


/** The selected client ID, when present, is the source of truth for display.
 * Legacy free-text names remain visible when no matching client record exists.
 * Caller must still enforce its access policy before displaying names. */
export function unitPartyName(data,unit,role){
 if(role!=='owner'&&role!=='tenant')return '';
 const linked=findDossierRow(data?.clients||[],unit?.[role+'Id']);
 return linked?.name||unit?.[role]||'';
}

/** Prevent incompatible client profiles from being offered in unit editors.
 * Draft profiles without a role remain selectable for legacy compatibility;
 * backend validation still makes the final decision. */
export function clientOptionsForRole(clients,role){
 if(!['owner','tenant'].includes(role))return [];
 return (clients||[]).filter(client=>client?.status!=='archived'&&
  (!client?.type||client.type==='both'||client.type===role))
  .map(client=>({value:client.id,label:[client.name,client.code].filter(Boolean).join(' · ')||'Chưa đặt tên'}));
}
