import { describe, expect, it } from 'vitest';
import { GLYPHS, SCENE_BIT } from './atlas';

describe('SCENE_BIT', () => {
  it('stays above the last glyph and inside one byte', () => {
    expect(SCENE_BIT).toBe(128);
    expect([...GLYPHS].length - 1 + SCENE_BIT).toBeLessThanOrEqual(255);
  });
});
