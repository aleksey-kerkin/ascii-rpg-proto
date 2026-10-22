/** Character cells occupied by a length measured in the same pixels as `cellPixels`. */
export function pxToCells(pixels: number, cellPixels: number): number {
  return pixels / cellPixels;
}

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PatchEllipse {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
}

const MARGIN = 0.35;

/** Ellipse around a pixel box. Each side grows by 35% of the box height. */
export function patchEllipse(box: PixelBox): PatchEllipse {
  const margin = MARGIN * box.h;
  return {
    centerX: box.x + box.w / 2,
    centerY: box.y + box.h / 2,
    halfW: box.w / 2 + margin,
    halfH: box.h / 2 + margin,
  };
}
