import { describe, expect, it } from 'vitest';
import { pointerGesture } from './gesture';

describe('pointerGesture', () => {
  it('treats 5 CSS pixels as a click and anything farther as an orbit', () => {
    expect(pointerGesture({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe('click');
    expect(pointerGesture({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe('click');
    expect(pointerGesture({ x: 10, y: 10 }, { x: 10, y: 16 })).toBe('orbit');
    expect(pointerGesture({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe('orbit');
  });
});
