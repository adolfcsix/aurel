/**
 * Reject late async results after an account switch, logout or newer request.
 * A token is scoped to this mounted workspace, never persisted or sent to APIs.
 * The server still makes every authorization decision.
 */
export function createSessionBoundary(){
 let revision=0;
 return Object.freeze({
  capture:()=>revision,
  invalidate:()=>++revision,
  matches:ticket=>ticket===revision
 });
}
