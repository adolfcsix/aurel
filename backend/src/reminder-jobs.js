// Internal scheduling only. Never sends external messages or records a payment.
import {create,reminderQueue,log} from './domain.js';
function offsetDays(due,now){return Math.round((Date.parse(due+'T00:00:00Z')-Date.parse(now+'T00:00:00Z'))/86400000)}
export function queueDailyInternalReminders(db,day,actor={id:'system',name:'Hệ thống'}){
 const due=reminderQueue(db,day),existing=new Set(db.reminderNotifications.map(n=>`${n.scheduleId}|${n.kind}`));let created=0;
 const lead=Number(db.preferences?.reminderDays??5);
 for(const s of due){const diff=offsetDays(s.dueOn,day);
  const kind=diff>0&&diff<=lead?'upcoming':diff===0?'due':diff===-1?'overdue':diff<0&&-diff%7===0?`overdue-week-${Math.floor(-diff/7)}`:null;
  if(!kind||existing.has(`${s.id}|${kind}`))continue;
  const row=create({scheduleId:s.id,unitId:s.unitId,leaseId:s.leaseId,forDate:day,dueOn:s.dueOn,amountRemaining:s.left,kind,status:'unread'});
  db.reminderNotifications.push(row);existing.add(`${s.id}|${kind}`);created++;
 }
 if(created)log(db,actor,'reminders.daily.created',day,null,{created});return {date:day,created,unpaid:due.length};
}
