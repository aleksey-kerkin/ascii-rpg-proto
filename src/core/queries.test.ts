import { describe, expect, it } from 'vitest';
import { lineOfSight, reachable } from './queries';
import type { BattleState, Cell, Unit } from './types';

function openMap(width: number, height: number, patch?: (x: number, y: number, cell: Cell) => Cell): BattleState['map'] {
  const cells: Cell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = { height: 0, wall: false, cover: 0 };
      cells.push(patch ? patch(x, y, cell) : cell);
    }
  }
  return { width, height, cells };
}

function unit(partial: Pick<Unit, 'id' | 'pos'> & Partial<Unit>): Unit {
  return {
    team: 'party',
    hp: 10,
    maxHp: 10,
    ap: 2,
    maxAp: 2,
    accuracy: 100,
    damage: 4,
    alive: true,
    ...partial,
  };
}

function battle(units: readonly Unit[], map = openMap(3, 3)): BattleState {
  return {
    map,
    units,
    round: 1,
    queue: units.map((u) => u.id),
    activeIndex: 0,
    rng: { seed: 1, cursor: 4 },
    status: { kind: 'ongoing' },
  };
}

describe('lineOfSight', () => {
  it('reads the map and does not advance the cursor', () => {
    const state = battle([
      unit({ id: 'a', pos: { x: 0, y: 0 } }),
      unit({ id: 'b', pos: { x: 1, y: 0 }, team: 'machines' }),
    ]);
    expect(lineOfSight(state, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
    expect(state.rng.cursor).toBe(4);
  });
});

describe('reachable', () => {
  it('lists cells within the current action points, ordered by y then x', () => {
    const state = battle([unit({ id: 'a', pos: { x: 0, y: 0 }, ap: 2 })]);
    expect(reachable(state, 'a')).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
    ]);
    expect(state.rng.cursor).toBe(4);
  });

  it('stops on walls, living units, and a height delta above 1', () => {
    const map = openMap(3, 3, (x, y, cell) => {
      if (x === 1 && y === 0) return { ...cell, wall: true };
      if (x === 1 && y === 1) return { ...cell, height: 2 };
      return cell;
    });
    const state = battle([
      unit({ id: 'a', pos: { x: 0, y: 0 }, ap: 3 }),
      unit({ id: 'b', pos: { x: 0, y: 1 }, team: 'machines' }),
    ], map);
    expect(reachable(state, 'a')).toEqual([]);
  });

  it('returns an empty list for an unknown or dead unit, or when ap is 0', () => {
    const state = battle([unit({ id: 'a', pos: { x: 0, y: 0 }, ap: 0, alive: false })]);
    expect(reachable(state, 'missing')).toEqual([]);
    expect(reachable(state, 'a')).toEqual([]);
  });
});
