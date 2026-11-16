/** A missing prerequisite is not a passing readiness check. */
export function preflightExitCode(results,{advisory=false}={}){
 return !advisory&&results.some(entry=>entry.kind==='BLOCK')?2:0;
}
