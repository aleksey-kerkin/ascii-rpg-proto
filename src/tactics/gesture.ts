export const CLICK_PX = 5;

export function pointerGesture(
  down: { readonly x: number; readonly y: number },
  up: { readonly x: number; readonly y: number },
): 'click' | 'orbit' {
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  return Math.hypot(dx, dy) > CLICK_PX ? 'orbit' : 'click';
}
