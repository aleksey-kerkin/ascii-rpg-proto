import { describe, expect, it } from 'vitest';
import { patchEllipse, pxToCells } from './pixels';

describe('pxToCells', () => {
  it('divides pixels by the current cell', () => {
    expect(pxToCells(30, 10)).toBe(3);
    expect(pxToCells(30, 20)).toBe(1.5);
    expect(pxToCells(78, 13)).toBe(6);
  });
});

describe('patchEllipse', () => {
  it('keeps the box center and grows each side by 35% of the height', () => {
    expect(patchEllipse({ x: 0, y: 0, w: 10, h: 20 })).toEqual({
      centerX: 5,
      centerY: 10,
      halfW: 12,
      halfH: 17,
    });
  });
});
