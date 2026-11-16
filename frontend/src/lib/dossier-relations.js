import {sameDossierId,dedupeDossierRows} from './dossier-id.js';
/** Read-only dossier selectors. Use explicit IDs; never infer identities from matching names. */
const rows=(data,key)=>Array.isArray(data?.[key])?data[key]:[];
export function clientUnitLinks(data,clientId){
 if(!clientId)return {owned:[],rented:[],all:[]};
 const owned=rows(data,'units').filter(u=>sameDossierId(u.ownerId,clientId));
 const leaseUnitIds=new Set(rows(data,'leases').filter(l=>l.status==='active'&&sameDossierId(l.tenantId,clientId)).map(l=>String(l.unitId??'').trim()).filter(Boolean));
 const rented=rows(data,'units').filter(u=>sameDossierId(u.tenantId,clientId)||leaseUnitIds.has(String(u.id).trim()));
 const all=dedupeDossierRows([...owned,...rented]);
 return {owned,rented,all};
}
/** A lease on a client's unit is NOT proof that the client signed it. */
export function possibleClientLeases(data,clientId){
 const linked=clientUnitLinks(data,clientId);
 const unitIds=new Set(linked.all.map(u=>String(u.id).trim()));
 return rows(data,'leases').filter(l=>l.unitId!=null&&unitIds.has(String(l.unitId).trim())&&l.status!=='archived');
}
/** Contract parties are confirmed only by persisted tenantId; unit associations alone are contextual. */
export function clientLeaseLinks(data,clientId){
 const verified=rows(data,'leases').filter(l=>l.status!=='archived'&&sameDossierId(l.tenantId,clientId));
 const verifiedIds=new Set(verified.map(l=>String(l.id)));
 const related=possibleClientLeases(data,clientId).filter(l=>!verifiedIds.has(String(l.id)));
 return {verified,related};
}
export function leaseDossierLinks(data,leaseId){
 const lease=rows(data,'leases').find(l=>sameDossierId(l.id,leaseId));
 if(!lease)return null;
 const unit=rows(data,'units').find(u=>sameDossierId(u.id,lease.unitId))||null;
 return {lease,unit,schedules:rows(data,'schedules').filter(s=>sameDossierId(s.leaseId,lease.id)&&!['archived','historical','cancelled'].includes(s.status)),transactions:rows(data,'depositTransactions').filter(t=>sameDossierId(t.leaseId,lease.id)),proposals:rows(data,'depositSettlements').filter(p=>sameDossierId(p.leaseId,lease.id))};
}
export function projectDossierLinks(data,projectId){
 const project=rows(data,'projects').find(p=>sameDossierId(p.id,projectId));if(!project)return null;
 const buildings=rows(data,'buildings').filter(b=>sameDossierId(b.projectId,projectId));
 const units=rows(data,'units').filter(u=>sameDossierId(u.projectId,projectId));
 const unitIds=new Set(units.map(u=>u.id==null?'':String(u.id).trim()).filter(Boolean));
 const leases=rows(data,'leases').filter(l=>l.unitId!=null&&unitIds.has(String(l.unitId).trim()));
 return {project,buildings,units,leases};
}
export function staffDossierLinks(data,staffId){
 const staff=rows(data,'staff').find(s=>sameDossierId(s.id,staffId));if(!staff)return null;
 const managed=rows(data,'units').filter(u=>sameDossierId(u.managerId,staffId));
 const sales=rows(data,'units').filter(u=>sameDossierId(u.saleId,staffId));
 return {staff,managed,sales};
}
export function contactDisplayType(type){return {owner:'Chủ sở hữu',tenant:'Khách thuê',both:'Chủ sở hữu và khách thuê'}[type]||'Hồ sơ liên hệ'};
