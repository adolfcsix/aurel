/** Pure, presentation-only logic for the currently viewed form chapter.
 * Invalid/hidden sections are ignored; never changes the saved record. */
export function activeEditorChapter(offsets, threshold=124, fallback=0) {
 if(!Array.isArray(offsets)||!offsets.length)return 0;
 let current=0, hasVisible=false;
 for(let index=0;index<offsets.length;index++){
  const offset=offsets[index];
  if(!Number.isFinite(offset))continue;
  hasVisible=true;
  if(offset<=threshold)current=index;
 }
 return hasVisible?current:Math.max(0,Math.min(offsets.length-1,fallback));
}
export function editorScrollBehavior(reducedMotion) {
 return reducedMotion?'auto':'smooth';
}
