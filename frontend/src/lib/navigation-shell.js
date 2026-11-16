/** Role-filtered navigation. Do not show sections that contain no permitted destinations.
 * Caller supplies the server-aligned permission predicate; labels do not grant rights. */
export function visibleNavigationGroups(groups=[],user,canNavigate){
 if(typeof canNavigate!=="function")throw new TypeError("A permission predicate is required");
 return groups.map(group=>({...group,items:(group.items||[]).filter(([key])=>canNavigate(user,key))})).filter(group=>group.items.length>0);
}


/** Viewer-only entitlement preview. These are NOT routes, permissions or API actions.
 * Ownership must be verified by the backend before any new property operation
 * becomes available. Administrative/financial operations are intentionally absent. */
const OWNED_ASSET_PREVIEW=Object.freeze({
 key:'owned-assets', label:'Tài sản của tôi', icon:'building',
 reason:'Chỉ mở khi quyền sở hữu tài sản được xác minh.'
});
export function lockedPersonalFeatures(user){
 return user?.role==='viewer'&&!(Number(user.ownedUnitCount)>0)?[OWNED_ASSET_PREVIEW]:[];
}

/** Name operational settings by their actual scope; managers cannot grant roles. */
export function navigationDisplayLabel(user,key,label){
 return key==='settings'&&user?.role==='manager'?'Thiết lập vận hành':label;
}
