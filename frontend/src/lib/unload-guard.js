/** Register only while work could be lost. Never store sensitive drafts locally.
 * Browsers choose their own prompt text and may suppress it without user activation.
 */
export function protectPendingWork(target, pending) {
 if (!pending) return () => {};
 const guard = event => {
  event.preventDefault();
  event.returnValue = '';
 };
 target.addEventListener('beforeunload', guard);
 return () => target.removeEventListener('beforeunload', guard);
}
