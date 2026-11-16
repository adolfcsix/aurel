/** Shared keyboard/focus behavior for non-destructive AUREL dialog surfaces.
 * No React dependency: unit-testable and reusable by search and record dossiers.
 */
const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function dialogFocusables(dialog) {
  if (!dialog) return [];
  return Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(element =>
    !element.hasAttribute?.('disabled') &&
    !element.matches?.(':disabled') &&
    element.getAttribute?.('aria-hidden') !== 'true' &&
    !element.closest?.('[inert],[aria-hidden="true"]') &&
    !['hidden','collapse'].includes(element.ownerDocument?.defaultView?.getComputedStyle?.(element)?.visibility) &&
    typeof element.getClientRects === 'function' && element.getClientRects().length > 0
  );
}

export function topmostModal(dialog) {
  if (!dialog?.ownerDocument) return false;
  const dialogs = Array.from(dialog.ownerDocument.querySelectorAll('[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]'));
  return dialogs.at(-1) === dialog;
}

/** Returns true only when Tab was handled to prevent focus from escaping. */
export function containModalTab(event, dialog, fallback) {
  if (event.key !== 'Tab' || !dialog) return false;
  const items = dialogFocusables(dialog);
  if (!items.length) {
    event.preventDefault();
    fallback?.focus?.({preventScroll:true});
    return true;
  }
  const current = dialog.ownerDocument?.activeElement;
  const first = items[0], last = items.at(-1);
  if (!dialog.contains(current)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({preventScroll:true});
    return true;
  }
  if (event.shiftKey && current === first) {
    event.preventDefault();
    last.focus({preventScroll:true});
    return true;
  }
  if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus({preventScroll:true});
    return true;
  }
  return false;
}
