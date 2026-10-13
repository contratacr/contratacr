// Reuse the visible back control: it knows about nested steps, return routes
// and unsaved edits. Never infer a destination from a URL or leave a root screen.
export function visibleNativeBackControl(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(
    '[data-native-back], [data-ccr-section-back], header button[aria-label="Volver"], header a[aria-label="Volver"], header button[aria-label="Back"], header a[aria-label="Back"]',
  )].find((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight) return false;
    if (element.matches(':disabled, [aria-disabled="true"]')) return false;
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return !!top && (top === element || element.contains(top));
  });
}

export function installNativeEdgeBackGesture(onBack: (control: HTMLElement) => void): () => void {
  let start: { x: number; y: number; time: number; id: number; control: HTMLElement } | undefined;
  const reset = () => { start = undefined; };
  const begin = (event: TouchEvent) => {
    reset();
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (touch.clientX > 28 || touch.clientY < 24 || touch.clientY > innerHeight - 48) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"], canvas, [data-no-back-gesture]')) return;
    // Horizontally scrollable content keeps its own gestures, even at the edge.
    for (let element: Element | null = target; element && element !== document.body; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (/auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 2) return;
    }
    const control = visibleNativeBackControl();
    if (!control) return;
    start = { x: touch.clientX, y: touch.clientY, time: performance.now(), id: touch.identifier, control };
  };
  const move = (event: TouchEvent) => {
    if (!start) return;
    if (event.touches.length !== 1) return reset();
    const touch = event.touches[0];
    const dx = touch.clientX - start.x, dy = Math.abs(touch.clientY - start.y);
    if (touch.identifier !== start.id || dx < -8 || (dy > 12 && dy > Math.max(0, dx) / 2)) reset();
  };
  const end = (event: TouchEvent) => {
    const gesture = start;
    reset();
    if (!gesture || event.touches.length !== 0) return;
    const touch = [...event.changedTouches].find((item) => item.identifier === gesture.id);
    if (!touch || performance.now() - gesture.time > 750) return;
    const dx = touch.clientX - gesture.x, dy = Math.abs(touch.clientY - gesture.y);
    if (dx < 72 || dx < dy * 2 || visibleNativeBackControl() !== gesture.control) return;
    onBack(gesture.control);
  };
  document.addEventListener('touchstart', begin, { passive: true });
  document.addEventListener('touchmove', move, { passive: true });
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
  return () => {
    document.removeEventListener('touchstart', begin);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', end);
    document.removeEventListener('touchcancel', reset);
  };
}
