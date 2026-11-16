/** Lightweight completeness hints, never a requirement for saving drafts. */
const hasValue=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
export function reviewUnit(unit){
 const labels=[];
 if(!hasValue(unit?.code))labels.push('Mã căn');
 if(!hasValue(unit?.projectId))labels.push('Dự án');
 if(!hasValue(unit?.buildingId)&&!hasValue(unit?.building))labels.push('Tòa nhà');
 if(!hasValue(unit?.ownerId)&&!hasValue(unit?.owner))labels.push('Chủ sở hữu');
 if(!hasValue(unit?.managerId))labels.push('Người phụ trách');
 if(unit?.status==='occupied'&&!hasValue(unit?.rent))labels.push('Giá thuê tham khảo');
 return {complete:labels.length===0,labels};
}
export const needsReview=unit=>!reviewUnit(unit).complete;
export function portfolioReview(units=[]){
 const reviews=units.map(unit=>({unit,review:reviewUnit(unit)}));
 const incomplete=reviews.filter(x=>!x.review.complete);
 const reasons=new Map();
 for(const item of incomplete)for(const label of item.review.labels)reasons.set(label,(reasons.get(label)||0)+1);
 return {total:units.length,ready:units.length-incomplete.length,needs:incomplete.length,
  topReasons:[...reasons].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'vi')).slice(0,3).map(([name,count])=>({name,count}))};
}
