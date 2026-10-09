import { describe, expect, it } from 'vitest';
import { createBattle } from '../core';
import { firstEncounter } from './encounter';

describe('firstEncounter', () => {
  it('matches the 8 by 6 hotseat battle', () => {
    expect(firstEncounter.seed).toBe(1);
    expect(firstEncounter.map.width).toBe(8);
    expect(firstEncounter.map.height).toBe(6);
    expect(firstEncounter.map.cells).toHaveLength(48);
    const at = (x: number, y: number) => firstEncounter.map.cells[y * 8 + x];
    expect(at(3, 0)).toEqual({ height: 0, wall: true, cover: 0 });
    expect(at(3, 1)).toEqual({ height: 0, wall: true, cover: 0 });
    expect(at(4, 1)).toEqual({ height: 1, wall: false, cover: 0 });
    expect(at(4, 2)).toEqual({ height: 1, wall: false, cover: 0 });
    expect(at(2, 2)).toEqual({ height: 0, wall: false, cover: 1 });
    expect(at(5, 3)).toEqual({ height: 0, wall: false, cover: 1 });
    expect(at(0, 0)).toEqual({ height: 0, wall: false, cover: 0 });
    expect(firstEncounter.units.map((unit) => [unit.id, unit.team, unit.pos.x, unit.pos.y])).toEqual([
      ['a', 'party', 1, 1],
      ['b', 'party', 1, 4],
      ['c', 'machines', 6, 1],
      ['d', 'machines', 6, 4],
    ]);
    for (const unit of firstEncounter.units) {
      expect(unit.hp).toBe(8);
      expect(unit.maxHp).toBe(8);
      expect(unit.maxAp).toBe(3);
      expect(unit.accuracy).toBe(80);
      expect(unit.damage).toBe(4);
    }
    const created = createBattle(firstEncounter);
    expect(created.ok).toBe(true);
  });
});
