export function messageMenuTop(box: { top: number; bottom: number }, menuHeight: number, viewportHeight: number, viewportTop = 0) {
  const gap = 8;
  const min = viewportTop + 12;
  const max = Math.max(min, viewportTop + viewportHeight - menuHeight - 12);
  const below = box.bottom + gap;
  return below <= max ? Math.max(min, below) : Math.min(max, Math.max(min, box.top - gap - menuHeight));
}
export function dismissImageSwipe(dx: number, dy: number, scale = 1) {
  return scale <= 1.01 && Math.abs(dy) >= 80 && Math.abs(dy) > Math.abs(dx) * 1.25;
}
