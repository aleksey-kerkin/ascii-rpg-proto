import { describe, expect, it } from 'vitest';
import { mix, rollD100 } from './rng';

describe('mix', () => {
  it('matches the locked seed-1 sequence', () => {
    expect(mix(1, 0)).toBe(2261973619);
    expect(mix(1, 1)).toBe(1580013426);
    expect((mix(1, 0) % 100) + 1).toBe(20);
    expect((mix(1, 1) % 100) + 1).toBe(27);
  });
});

describe('rollD100', () => {
  it('returns 1..100 and leaves the input cursor unchanged', () => {
    const rng = { seed: 1, cursor: 0 };
    const next = rollD100(rng);
    expect(rng).toEqual({ seed: 1, cursor: 0 });
    expect(next.roll).toBe(20);
    expect(next.rng).toEqual({ seed: 1, cursor: 1 });
    expect(rollD100(next.rng).roll).toBe(27);
  });
});
