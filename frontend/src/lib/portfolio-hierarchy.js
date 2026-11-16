/** A single ID-verified hierarchy for project index, spatial catalog and dossiers.
 * Relationships are established by persisted IDs, never free-text names.
 * Orphans remain visible for reconciliation rather than guessed into a parent.
 */
import {sameDossierId,findDossierRow} from './dossier-id.js';
import {unitPartyName} from './client-profile.js';

const rows=(data,key)=>Array.isArray(data?.[key])?data[key]:[];
const isLinked=(row,key,id)=>sameDossierId(row?.[key],id);

export function projectOccupancy(units=[]){
 const list=Array.isArray(units)?units:[];
 const occupied=list.filter(unit=>unit.status==='occupied').length;
 return {units:list.length,occupied,drafts:list.filter(unit=>unit.status==='draft').length,percent:list.length?Math.round(occupied/list.length*100):0};
}

export function portfolioHierarchy(data={}){
 const projects=rows(data,'projects'),buildings=rows(data,'buildings'),floors=rows(data,'floors'),rooms=rows(data,'rooms'),units=rows(data,'units');
 const connectedBuildings=buildings.filter(building=>findDossierRow(projects,building.projectId));
 const connectedFloors=floors.filter(floor=>findDossierRow(connectedBuildings,floor.buildingId));
 const connectedRooms=rooms.filter(room=>findDossierRow(connectedFloors,room.floorId));
 const buildingsFor=projectId=>connectedBuildings.filter(row=>isLinked(row,'projectId',projectId));
 const floorsFor=buildingId=>connectedFloors.filter(row=>isLinked(row,'buildingId',buildingId));
 const roomsFor=floorId=>connectedRooms.filter(row=>isLinked(row,'floorId',floorId));
 const unitsFor=projectId=>units.filter(row=>isLinked(row,'projectId',projectId));
 const project=projectId=>{
  const selectedBuildings=buildingsFor(projectId);
  const selectedFloors=connectedFloors.filter(floor=>selectedBuildings.some(building=>sameDossierId(building.id,floor.buildingId)));
  const selectedRooms=connectedRooms.filter(room=>selectedFloors.some(floor=>sameDossierId(floor.id,room.floorId)));
  const selectedUnits=unitsFor(projectId);
  const {occupied,drafts,percent}=projectOccupancy(selectedUnits);
  return {buildings:selectedBuildings,floors:selectedFloors,rooms:selectedRooms,units:selectedUnits,occupied,drafts,percent};
 };
 return {projects,buildings,floors,rooms,units,project,buildingsFor,floorsFor,roomsFor,unitsFor,
  unassigned:{
   buildings:buildings.filter(row=>!findDossierRow(projects,row.projectId)),
   floors:floors.filter(row=>!findDossierRow(connectedBuildings,row.buildingId)),
   rooms:rooms.filter(row=>!findDossierRow(connectedFloors,row.floorId))
  }};
}

/** Visible portfolio rows use the same persisted-ID semantics as project dossiers.
 * Search never indexes personal owner/tenant display names for roles without
 * the portfolio financial permission. No accounting or source data is changed.
 */
export function filterPortfolioUnits(data={},options={},reviewPredicate=()=>false){
 const {projectId='',staffId='',reviewOnly=false,search='',includeNames=false}=options;
 const query=String(search??'').trim().toLocaleLowerCase('vi');
 const projects=rows(data,'projects');
 return rows(data,'units').filter(unit=>{
  if(projectId&&!sameDossierId(unit.projectId,projectId))return false;
  if(staffId&&!sameDossierId(unit.managerId,staffId))return false;
  if(reviewOnly&&!reviewPredicate(unit))return false;
  if(!query)return true;
  const projectName=findDossierRow(projects,unit.projectId)?.name;
  const fields=[unit.code,unit.building,unit.room,unit.address,projectName,...(includeNames?[unitPartyName(data,unit,'owner'),unitPartyName(data,unit,'tenant')]:[])];
  return fields.some(value=>String(value??'').toLocaleLowerCase('vi').includes(query));
 });
}
