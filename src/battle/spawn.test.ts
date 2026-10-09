import { describe, expect, it } from 'vitest';
import { spawnBeats } from './spawn';

describe('spawnBeats', () => {
  it('types each id, and online after a robot id', () => {
    expect(spawnBeats(['a', 'b', 'c', 'd'], ['c', 'd'])).toEqual([
      { kind: 'spawn', unitId: 'a', lines: ['a'] },
      { kind: 'spawn', unitId: 'b', lines: ['b'] },
      { kind: 'spawn', unitId: 'c', lines: ['c', 'online'] },
      { kind: 'spawn', unitId: 'd', lines: ['d', 'online'] },
    ]);
  });
});
