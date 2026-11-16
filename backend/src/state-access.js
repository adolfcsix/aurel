/**
 * Privileged state projection. The viewer projection uses an allow-list so that
 * newly-added contract, financial or personally identifying fields never leak
 * by default. This module has no Express dependency and can be unit-tested.
 */
import {samePersistedId,active,safeAuditEntry} from './domain.js';
import {hasPermission} from './security.js';
const pick=(record,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(record,key)).map(key=>[key,record[key]]));
const PROJECT_KEYS=['id','name','short','city','address','buildings','status','createdAt'];
const BUILDING_KEYS=['id','projectId','code','name','address','status','createdAt'];
const FLOOR_KEYS=['id','projectId','buildingId','code','name','status','createdAt'];
const ROOM_KEYS=['id','projectId','buildingId','floorId','code','name','status','createdAt'];
const INVENTORY_KEYS=['id','code','projectId','buildingId','building','floorId','roomId','floor','room','address','area','bedrooms','status','interiorStatus','managerId','saleId','createdAt','revision','leaseStart','leaseEnd'];
const LEASE_KEYS=['id','unitId','startsOn','endsOn','status','createdAt'];
const staffDirectory=staff=>staff.map(({id,name,short,role})=>({id,name,short,role}));
// The accountant can reconcile money, but has no client.read permission.
// Explicit field allowlists also fail closed when new private fields are added.
// Notes and manually entered owner/tenant names are not financial identifiers.
const ACCOUNTING_PROJECT_KEYS=PROJECT_KEYS.filter(key=>key!=='buildings');
const ACCOUNTING_UNIT_KEYS=[...INVENTORY_KEYS,'rent','renewalRent','feePercent','feeBasis','deposit','depositReturned','paymentDay'];
const ACCOUNTING_LEASE_KEYS=[...LEASE_KEYS,'rent','depositExpected','paymentDay','terminatedOn','closureDate'];
const ACCOUNTING_SCHEDULE_KEYS=['id','leaseId','unitId','period','dueOn','amount','feePercent','feeBasis','status','createdAt'];
const ACCOUNTING_PAYMENT_KEYS=['id','unitId','leaseId','scheduleId','period','amount','date','method','reference','status','createdBy','reversedBy','reversedAt','createdAt'];
const ACCOUNTING_ATTACHMENT_KEYS=['id','paymentId','filename','mime','size','sizeBytes','sha256','checksum','createdBy','createdAt'];
const ACCOUNTING_DEPOSIT_KEYS=['id','leaseId','unitId','kind','amount','refund','deduction','date','reference','by','proposalId','status','demoOnly','createdAt'];
const ACCOUNTING_SETTLEMENT_KEYS=['id','leaseId','unitId','refund','deduction','status','createdBy','createdByName','approvedBy','executedBy','rejectedBy','requestedAt','approvedAt','executedAt','rejectedAt','balanceAtRequest','transactionId','createdAt'];
const ACCOUNTING_FEE_KEYS=['id','unitId','percent','configuredPercent','inheritedDefault','basis','effectiveFrom','previousPercent','changedBy','createdAt'];
const ACCOUNTING_CONTACT_KEYS=['id','scheduleId','leaseId','unitId','outcome','nextContactOn','contactedAt','createdBy','createdAt'];
const ACCOUNTING_NOTICE_KEYS=['id','scheduleId','leaseId','unitId','forDate','dueOn','amountRemaining','kind','status','readBy','readAt','createdAt'];
// All accounting response fields are scalar. A malformed/legacy nested value
// must not transport a hidden contact record through an otherwise allowed key.
const rows=(items,keys)=>(items||[]).map(item=>Object.fromEntries(keys
 .filter(key=>Object.hasOwn(item,key)&&(
  item[key]===null||['string','number','boolean'].includes(typeof item[key])))
 .map(key=>[key,item[key]])));

/** Server-verified assignment: missing/blank IDs never grant a unit. */
export const assignedToStaff=(unit,staffId)=>samePersistedId(unit?.managerId,staffId)||samePersistedId(unit?.saleId,staffId);
export const hasAssignedUnit=(units,unitId,staffId)=>(units||[]).some(unit=>samePersistedId(unit.id,unitId)&&assignedToStaff(unit,staffId));
export function scoped(req,db){
 // Unknown/inactive role must never fall through to the full manager projection.
 if(!['viewer','staff','admin','manager','accountant'].includes(req.user?.role)){const error=new Error('Vai trò không được phép truy cập dữ liệu');error.status=403;throw error;}
 if(req.user.role==='viewer')return {
  projects:db.projects.map(row=>pick(row,PROJECT_KEYS)),buildings:db.buildings.map(row=>pick(row,BUILDING_KEYS)),
  floors:db.floors.map(row=>pick(row,FLOOR_KEYS)),rooms:db.rooms.map(row=>pick(row,ROOM_KEYS)),
  clients:[], staff:staffDirectory(db.staff),
  units:db.units.map(unit=>({...pick(unit,INVENTORY_KEYS), owner:'',tenant:'',ownerId:'',tenantId:'',rent:null,renewalRent:null,feePercent:null,feeBasis:'',deposit:null,depositReturned:null,notes:'',interiorNotes:'',paymentDay:null})),
  leases:db.leases.map(lease=>({...pick(lease,LEASE_KEYS),tenantName:'',rent:null,depositExpected:null,notes:'',paymentDay:null})),
  schedules:[],payments:[],paymentAttachments:[],depositTransactions:[],depositSettlements:[],feeHistory:[],reminderContacts:[],reminderNotifications:[],users:[],sessions:[],audit:[],
  preferences:{company:db.preferences?.company||'',reminderDays:db.preferences?.reminderDays??5,defaultFee:null}
 };
 if(req.user.role==='admin'||req.user.role==='manager')return db;
 if(req.user.role==='accountant')return {
  projects:rows(db.projects,ACCOUNTING_PROJECT_KEYS),buildings:rows(db.buildings,BUILDING_KEYS),
  floors:rows(db.floors,FLOOR_KEYS),rooms:rows(db.rooms,ROOM_KEYS),
  staff:staffDirectory(db.staff),clients:[],
  units:rows(db.units,ACCOUNTING_UNIT_KEYS),leases:rows(db.leases,ACCOUNTING_LEASE_KEYS),
  schedules:rows(db.schedules,ACCOUNTING_SCHEDULE_KEYS),payments:rows(db.payments,ACCOUNTING_PAYMENT_KEYS),
  paymentAttachments:rows(db.paymentAttachments,ACCOUNTING_ATTACHMENT_KEYS),
  depositTransactions:rows(db.depositTransactions,ACCOUNTING_DEPOSIT_KEYS),
  depositSettlements:rows(db.depositSettlements,ACCOUNTING_SETTLEMENT_KEYS),
  feeHistory:rows(db.feeHistory,ACCOUNTING_FEE_KEYS),reminderContacts:rows(db.reminderContacts,ACCOUNTING_CONTACT_KEYS),
  reminderNotifications:rows(db.reminderNotifications,ACCOUNTING_NOTICE_KEYS),
  preferences:pick(db.preferences||{},['company','reminderDays','defaultFee']),
  users:[],sessions:[],audit:[]
 };

 // Use the exact persisted-ID contract shared by the UI; never coerce '07' to 7.
 // A missing staffId grants no portfolio access, even if the unit's assignment is blank.
 const ownedUnits=db.units.filter(u=>assignedToStaff(u,req.user.staffId));
 const hasId=(rows,id)=>rows.some(row=>samePersistedId(row.id,id));
 const ownedLeases=db.leases.filter(l=>hasId(ownedUnits,l.unitId));
 const ownedSchedules=db.schedules.filter(s=>hasId(ownedUnits,s.unitId));
 const linkedClients=ownedUnits.flatMap(x=>[x.ownerId,x.tenantId]);
 linkedClients.push(...ownedLeases.filter(lease=>lease.status!=='archived').map(lease=>lease.tenantId));
 const projectIds=ownedUnits.map(x=>x.projectId);
 return {...db,projects:db.projects.filter(x=>projectIds.some(id=>samePersistedId(x.id,id))),buildings:db.buildings.filter(x=>projectIds.some(id=>samePersistedId(x.projectId,id))),floors:db.floors.filter(x=>projectIds.some(id=>samePersistedId(x.projectId,id))),rooms:db.rooms.filter(x=>projectIds.some(id=>samePersistedId(x.projectId,id))),units:ownedUnits,leases:ownedLeases,schedules:ownedSchedules,payments:db.payments.filter(x=>hasId(ownedSchedules,x.scheduleId)),paymentAttachments:[],depositTransactions:[],feeHistory:[],reminderContacts:db.reminderContacts.filter(x=>hasId(ownedSchedules,x.scheduleId)),reminderNotifications:db.reminderNotifications.filter(x=>hasId(ownedSchedules,x.scheduleId)),depositSettlements:[],audit:[],clients:db.clients.filter(c=>linkedClients.some(id=>samePersistedId(c.id,id))),staff:db.staff.map(({id,name,short,role})=>({id,name,short,role})),users:[],sessions:[]};
}

/** Build the actual /api/state JSON shape in one place so tests cover the wire payload. */
export function stateResponse(req,rawDb,pubUser){
 const db=scoped(req,rawDb);
 return {projects:db.projects.filter(active),buildings:db.buildings.filter(active),floors:db.floors.filter(active),rooms:db.rooms.filter(active),
  staff:db.staff.filter(active),clients:db.clients.filter(active),units:db.units.filter(active),leases:db.leases.filter(active),
  schedules:db.schedules.filter(active),payments:db.payments,
  paymentAttachments:(db.paymentAttachments||[]).map(({diskName,...entry})=>entry),
  depositTransactions:db.depositTransactions,feeHistory:db.feeHistory,reminderContacts:db.reminderContacts,
  reminderNotifications:db.reminderNotifications,depositSettlements:db.depositSettlements,preferences:db.preferences,
  users:req.user.role==='admin'?db.users.filter(active).map(pubUser):[],
  audit:hasPermission(req.user,'audit.read')?db.audit.slice(0,100).map(safeAuditEntry):[]};
}
