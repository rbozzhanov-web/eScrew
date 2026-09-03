export type SwipeAxis = 'horizontal' | 'down';

export function swipeAxis(
  dx: number,
  dy: number,
  canSwipeHorizontally: boolean,
  canSwipeDown: boolean,
  dominance = 1.25,
): SwipeAxis | undefined {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (canSwipeHorizontally && absX > absY * dominance) return 'horizontal';
  if (canSwipeDown && dy > 0 && absY > absX * dominance) return 'down';
  return undefined;
}
