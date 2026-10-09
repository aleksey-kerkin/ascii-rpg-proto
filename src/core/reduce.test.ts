import { describe, expect, it } from 'vitest';
import { createBattle } from './reduce';
import type { BattleSetup, Cell, SetupUnit } from './types';

function cell(height = 0, wall = false, cover = 0): Cell {
  return { height, wall, cover };
}

function map(width: number, height: number, cells?: Cell[]): BattleSetup['map'] {
  return { width, height, cells: cells ?? Array.from({ length: width * height }, () => cell()) };
}

function fighter(id: string, team: string, x: number, y: number, extra: Partial<SetupUnit> = {}): SetupUnit {
  return { id, team, pos: { x, y }, hp: 10, maxHp: 10, maxAp: 3, accuracy: 50, damage: 4, ...extra };
}

function setup(seed: number, units: SetupUnit[], board = map(2, 1)): BattleSetup {
  return { seed, map: board, units };
}

function errorOf(result: ReturnType<typeof createBattle>): string {
  return result.ok ? 'ok' : result.error;
}

describe('createBattle', () => {
  it('rejects setup problems in spec order', () => {
    const validUnits = [fighter('a', 'party', 0, 0), fighter('b', 'machines', 1, 0)];
    expect(errorOf(createBattle(setup(1.5, validUnits)))).toBe('bad-seed');
    expect(errorOf(createBattle(setup(-1, validUnits)))).toBe('bad-seed');
    expect(errorOf(createBattle({ seed: 1, map: map(0, 1), units: validUnits }))).toBe('bad-map');
    expect(errorOf(createBattle({ seed: 1, map: map(1, 1, []), units: validUnits }))).toBe('bad-map');
    expect(errorOf(createBattle({ seed: 1, map: map(1, 1, [cell(-1)]), units: validUnits }))).toBe('bad-cell');
    expect(errorOf(createBattle({ seed: 1, map: map(1, 1, [{ height: 0, wall: 'no' as unknown as boolean, cover: 0 }]), units: validUnits }))).toBe('bad-cell');
    expect(errorOf(createBattle(setup(1, [fighter('', 'party', 0, 0), fighter('b', 'machines', 1, 0)])))).toBe('bad-unit');
    expect(errorOf(createBattle(setup(1, [fighter('a', 'party', 0, 0), fighter('a', 'machines', 1, 0)])))).toBe('bad-unit');
    expect(errorOf(createBattle(setup(1, [fighter('a', 'party', 0, 0, { hp: 0 }), fighter('b', 'machines', 1, 0)])))).toBe('bad-unit');
    expect(errorOf(createBattle(setup(1, [fighter('a', 'party', 2, 0), fighter('b', 'machines', 1, 0)])))).toBe('bad-placement');
    expect(errorOf(createBattle(setup(1, [fighter('a', 'party', 0, 0), fighter('b', 'machines', 0, 0)])))).toBe('bad-placement');
    expect(errorOf(createBattle({ seed: 1, map: map(1, 1, [cell(0, true)]), units: [fighter('a', 'party', 0, 0), fighter('b', 'machines', 0, 0)] }))).toBe('bad-placement');
    expect(errorOf(createBattle(setup(1, [fighter('a', 'party', 0, 0), fighter('b', 'party', 1, 0)])))).toBe('need-two-teams');
    expect(errorOf(createBattle(setup(1, [])))).toBe('need-two-teams');
  });

  it('rolls initiative once per living unit and activates the winner', () => {
    const high = createBattle(setup(1, [fighter('a', 'party', 0, 0), fighter('b', 'machines', 1, 0)]));
    expect(high.ok).toBe(true);
    if (!high.ok) return;
    expect(high.state.queue).toEqual(['b', 'a']);
    expect(high.state.round).toBe(1);
    expect(high.state.activeIndex).toBe(0);
    expect(high.state.units.find((u) => u.id === 'b')?.ap).toBe(3);
    expect(high.state.units.find((u) => u.id === 'a')?.ap).toBe(0);
    expect(high.state.rng).toEqual({ seed: 1, cursor: 2 });
    expect(high.state.status).toEqual({ kind: 'ongoing' });

    const tied = createBattle(setup(458, [fighter('b', 'machines', 1, 0), fighter('a', 'party', 0, 0)]));
    expect(tied.ok).toBe(true);
    if (!tied.ok) return;
    expect(tied.state.queue).toEqual(['a', 'b']);
  });

  it('copies setup data so later edits do not change the battle', () => {
    const board = map(2, 1);
    const units = [fighter('a', 'party', 0, 0), fighter('b', 'machines', 1, 0)];
    const created = createBattle({ seed: 2, map: board, units });
    if (!created.ok) throw new Error('expected a battle');
    units[0] = fighter('a', 'party', 0, 0, { hp: 1 });
    board.cells[0] = cell(4);
    expect(created.state.units[0]?.hp).toBe(10);
    expect(created.state.map.cells[0]?.height).toBe(0);
  });
});
