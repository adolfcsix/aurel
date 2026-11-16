import {allowed,dmy,rolePermissions} from './finance.js';
import {findDossierRow} from './dossier-id.js';
import {unitPartyName} from './client-profile.js';

/** One access policy for the sidebar and the private, in-memory navigation index. */
export function canNavigate(user,section){
 if(!user||!Object.hasOwn(rolePermissions,user.role))return false;
 const has=permission=>allowed(user,permission);
 // A basic viewer can browse the catalog and use a personal profile only.
 // Management destinations must not render as disabled or locked menu items.
 if(section==='profile')return true;
 if(section==='owned-assets')return user.role==='viewer'&&Number(user.ownedUnitCount)>0;
 if(user.role==='viewer')return ['dashboard','units','projects'].includes(section);
 if(section==='settings')return has('settings.write');
 if(section==='staff')return has('staff.write');
 if(section==='leases')return has('lease.read')||has('lease.write');
 if(['quality','audit'].includes(section))return has('audit.read');
 if(section==='imports')return has('unit.write');
 if(section==='archives')return ['project.write','building.write','unit.write','client.write','staff.write','lease.write'].some(has);
 // Preserve scoped staff payment follow-up, but do not expose client dossiers to
 // accountants without a client permission. Financial-policy and report screens
 // require their corresponding permission; no purely cosmetic link to an empty ledger.
 if(section==='clients')return has('client.read')||has('client.write');
 if(section==='fees')return has('fee.read')||has('fee.write');
 if(section==='deposits')return has('deposit.write')||has('deposit.execute')||has('deposit.approve');
 if(section==='reports')return has('report.read');
 if(['payments','reminders'].includes(section))return user.role!=='viewer';
 // Explicitly allow only supported destinations; a typo must not bypass the UI gate.
 if(['dashboard','units','projects'].includes(section))return true;
 return false;
}

export const normalizeQuery=(value)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi-VN').trim().replace(/\s+/g,' ');

/** Nothing is sent to a server: search only the already scoped /api/state payload. */
export function buildQuickFindIndex(data,user,sections=[]){
 if(!data||!user)return [];
 const index=[];
 for(const section of sections){
  if(!canNavigate(user,section.id))continue;
  index.push({key:'section:'+section.id,kind:'section',icon:section.icon||'layers',title:section.label,detail:section.group||'Không gian làm việc',hint:'Mở phân hệ',target:section.id,searchText:section.label+' '+(section.group||'')});
 }
 // Persisted IDs may be numbers in imported catalogs and strings in links.
 // Find by identity, never by project name or a fuzzy numerical cast (07 != 7).
 const projectById=id=>findDossierRow(data.projects,id);
 const unitById=id=>findDossierRow(data.units,id);
 for(const project of data.projects||[]){
  index.push({key:'project:'+project.id,kind:'project',icon:'building',title:project.name||'Dự án chưa đặt tên',detail:[project.city,project.address].filter(Boolean).join(' · ')||'Danh mục dự án',hint:'Xem căn hộ trong dự án',projectId:project.id,searchText:[project.name,project.city,project.address].join(' ')});
 }
 for(const unit of data.units||[]){
  const project=projectById(unit.projectId)?.name||'Chưa gắn dự án';
  const privateNames=canNavigate(user,'clients')?[unitPartyName(data,unit,'owner'),unitPartyName(data,unit,'tenant')]:[];
  index.push({key:'unit:'+unit.id,kind:'unit',icon:'apartment',title:unit.code||'Căn hộ chưa gán mã',detail:[project,unit.building,unit.floor&&'Tầng '+unit.floor,unit.room&&'Phòng '+unit.room].filter(Boolean).join(' · '),hint:'Mở hồ sơ căn hộ',unitId:unit.id,searchText:[unit.code,project,unit.building,unit.floor,unit.room,unit.address,...privateNames].join(' ')});
 }
 if(canNavigate(user,'leases'))for(const lease of data.leases||[]){
  const code=unitById(lease.unitId)?.code||'Chưa gắn căn hộ';
  index.push({key:'lease:'+lease.id,kind:'lease',icon:'document',title:'Hợp đồng · '+code,detail:lease.endsOn?'Kết thúc dự kiến: '+dmy(lease.endsOn):'Hồ sơ hợp đồng',hint:'Xem danh sách hợp đồng',target:'leases',searchText:[code,...(canNavigate(user,'clients')?[lease.tenantName]:[]),lease.startsOn,lease.endsOn].join(' ')});
 }
 if(canNavigate(user,'clients'))for(const client of data.clients||[]){
  index.push({key:'client:'+client.id,kind:'client',icon:'people',title:client.name||'Khách hàng chưa đặt tên',detail:client.type==='owner'?'Chủ sở hữu':client.type==='tenant'?'Khách thuê':'Hồ sơ liên hệ',hint:'Xem danh mục liên hệ',target:'clients',searchText:[client.name,client.code,client.phone,client.email].join(' ')});
 }
 return index;
}

export function findQuickResults(index,query,limit=9){
 const text=normalizeQuery(query);
 if(!text)return index.filter(x=>x.kind==='section').slice(0,Math.max(0,Math.min(6,limit)));
 const terms=text.split(' ').filter(Boolean);
 return index.map((item,order)=>{
  const name=normalizeQuery(item.title),search=normalizeQuery(item.title+' '+item.searchText);
  if(!terms.every(term=>search.includes(term)))return null;
  const score=(name===text?120:0)+(name.startsWith(text)?55:0)+(name.includes(text)?24:0)+(item.kind==='unit'?8:0)+(item.kind==='project'?5:0);
  return {item,score,order};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,Math.max(0,limit)).map(x=>x.item);
}
