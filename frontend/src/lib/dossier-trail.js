/** Read-only dossier navigation. Never infer relationships from display names. */
export const DOSSIER_TRAIL_LIMIT = 8;
export function recordRoute(kind,id){
 if(!['unit','client','lease','project','staff'].includes(kind) || (typeof id!=='string' && typeof id!=='number') || !String(id).trim())return null;
 return {kind,id};
}
export function enterDossier(trail=[],current,next){
 if(!next)return [...trail];
 if(!current)return [];
 if(current.kind===next.kind&&String(current.id)===String(next.id))return [...trail];
 return [...trail,current].slice(-DOSSIER_TRAIL_LIMIT);
}
export function leaveDossier(trail=[]){
 if(!trail.length)return {previous:null,trail:[]};
 return {previous:trail[trail.length-1],trail:trail.slice(0,-1)};
}
