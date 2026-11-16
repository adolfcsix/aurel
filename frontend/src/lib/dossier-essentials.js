/** Compact, read-only dossier summaries: count only explicit, persisted ID links. */
import {projectDossierLinks,staffDossierLinks,leaseDossierLinks} from './dossier-relations.js';
import {sameDossierId,findDossierRow,dedupeDossierRows} from './dossier-id.js';

const entries=(data,key)=>Array.isArray(data?.[key])?data[key]:[];
const same=sameDossierId;

export function projectEssentials(data,project){
 const linked=projectDossierLinks(data,project?.id);
 if(!linked)return null;
 const {buildings,units,leases}=linked;
 const perBuilding=buildings.map(building=>({building,units:units.filter(unit=>same(unit.buildingId,building.id))}));
 // Older imports may carry a free-text building inventory on the project record.
 // It is reference data only, never presented as a confirmed building relation.
 const existingCodes=new Set(buildings.flatMap(b=>[b.code,b.name].filter(Boolean).map(x=>String(x).trim().toLowerCase())));
 const legacyBuildingCodes=(Array.isArray(project.buildings)?project.buildings:[])
  .map(code=>String(code||'').trim()).filter(Boolean)
  .filter(code=>!existingCodes.has(code.toLowerCase()));
 const recognized=new Set(buildings.map(b=>String(b.id)));
 // Do not infer a formal building relation from the free-text `unit.building`.
 const withoutBuilding=units.filter(u=>!u.buildingId);
 const unresolved=units.filter(u=>u.buildingId&&!recognized.has(String(u.buildingId)));
 const linkedFloors=entries(data,'floors').filter(f=>f.buildingId&&recognized.has(String(f.buildingId)));
 const floorIds=new Set(linkedFloors.map(f=>String(f.id)));
 const linkedRooms=entries(data,'rooms').filter(r=>r.floorId&&floorIds.has(String(r.floorId)));
 return {buildings,units,leases,perBuilding,legacyBuildingCodes,withoutBuilding,unresolved,linkedFloors,linkedRooms,
  activeLeaseCount:leases.filter(l=>l.status==='active').length};
}

export function staffEssentials(data,staff){
 const linked=staffDossierLinks(data,staff?.id);
 if(!linked)return null;
 const unique=dedupeDossierRows([...linked.managed,...linked.sales]);
 const assignedProjects=new Set(unique.map(unit=>unit.projectId).filter(Boolean).map(String));
 return {...linked,unique,projectCount:assignedProjects.size,
  responsibility:unit=>[linked.managed.some(u=>same(u.id,unit.id))?'Quản lý':null,
                         linked.sales.some(u=>same(u.id,unit.id))?'Kinh doanh':null].filter(Boolean)};
}

export function leaseEssentials(data,lease){
 const linked=leaseDossierLinks(data,lease?.id);
 if(!linked)return null;
 const unit=linked.unit;
 const project=findDossierRow(entries(data,'projects'),unit?.projectId);
 const building=findDossierRow(entries(data,'buildings'),unit?.buildingId);
 return {...linked,project,building,
  location:[project?.name,building?.name||unit?.building,unit?.floor&&`Tầng ${unit.floor}`,unit?.room&&`Căn ${unit.room}`].filter(Boolean).join(' · '),
  hasNotes:Boolean(lease?.notes?.trim()),
  // A persisted client ID confirms an explicit internal link, not a legal identity check.
  tenantProfile:findDossierRow(entries(data,'clients'),lease?.tenantId),
  tenantIdentityVerified:Boolean(findDossierRow(entries(data,'clients'),lease?.tenantId))};
}

/** Financial details are never exposed to the read-only, restricted dossier. */
export function dossierAccess(showFinancial){
 return {financial:Boolean(showFinancial),clientNames:Boolean(showFinancial),
  rentSchedules:Boolean(showFinancial),paymentDetails:Boolean(showFinancial)};
}
