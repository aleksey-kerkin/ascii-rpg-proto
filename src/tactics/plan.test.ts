import { describe, expect, it } from 'vitest';
import { apply, createBattle } from '../core';
import type { BattleSetup, BattleState, Cell, Coord, SetupUnit } from '../core';
import { moveHighlights, planMachine, planMove, planStrike, strikeHighlights } from './plan';

function cell(height = 0, wall = false, cover = 0): Cell {
  return { height, wall, cover };
}

function board(width: number, height: number, cells?: Cell[]): BattleSetup['map'] {
  return { width, height, cells: cells ?? Array.from({ length: width * height }, () => cell()) };
}

function fighter(id: string, team: string, x: number, y: number, extra: Partial<SetupUnit> = {}): SetupUnit {
  return { id, team, pos: { x, y }, hp: 8, maxHp: 8, maxAp: 3, accuracy: 80, damage: 4, ...extra };
}

function activate(setup: BattleSetup, id: string): BattleState {
  const created = createBattle(setup);
  if (!created.ok) throw new Error(created.error);
  return {
    ...created.state,
    queue: [id, ...created.state.queue.filter((unitId) => unitId !== id)],
    activeIndex: 0,
    units: created.state.units.map((unit) => (unit.id === id ? { ...unit, ap: unit.maxAp } : { ...unit, ap: 0 })),
  };
}

describe('planMove', () => {
  it('follows the first breadth-first path in north, east, south, west order', () => {
    const state = activate({
      seed: 1,
      map: board(4, 4),
      units: [fighter('a', 'party', 1, 1), fighter('c', 'machines', 3, 3)],
    }, 'a');
    expect(planMove(state, { x: 2, y: 2 }).map((command) => command.type === 'move' ? command.to : command)).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it('walks the path onto the chosen cell and leaves the cursor alone', () => {
    const state = activate({
      seed: 1,
      map: board(4, 1),
      units: [fighter('a', 'party', 0, 0), fighter('c', 'machines', 3, 0)],
    }, 'a');
    const cursor = state.rng.cursor;
    const plan = planMove(state, { x: 2, y: 0 });
    expect(plan).toEqual([
      { type: 'move', unitId: 'a', to: { x: 1, y: 0 } },
      { type: 'move', unitId: 'a', to: { x: 2, y: 0 } },
    ]);
    let next = state;
    for (const command of plan) {
      const result = apply(next, command);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      next = result.state;
    }
    expect(next.units.find((unit) => unit.id === 'a')?.pos).toEqual({ x: 2, y: 0 });
    expect(state.rng.cursor).toBe(cursor);
  });

  it('returns no commands for a cell the active unit cannot reach', () => {
    const state = activate({
      seed: 1,
      map: board(3, 1, [cell(), cell(0, true), cell()]),
      units: [fighter('a', 'party', 0, 0), fighter('c', 'machines', 2, 0)],
    }, 'a');
    expect(planMove(state, { x: 2, y: 0 })).toEqual([]);
    expect(planMove(state, { x: 0, y: 0 })).toEqual([]);
  });
});

describe('highlights and planStrike', () => {
  it('highlights reachable cells only while a party unit is active', () => {
    const party = activate({
      seed: 1,
      map: board(3, 1),
      units: [fighter('a', 'party', 0, 0), fighter('c', 'machines', 2, 0)],
    }, 'a');
    expect(moveHighlights(party)).toEqual([{ x: 1, y: 0 }]);
    const machine = activate({
      seed: 1,
      map: board(3, 1),
      units: [fighter('a', 'party', 0, 0), fighter('c', 'machines', 2, 0)],
    }, 'c');
    expect(moveHighlights(machine)).toEqual([]);
    expect(strikeHighlights(machine)).toEqual([]);
  });

  it('highlights an adjacent machine and confirms a bare attack', () => {
    const state = activate({
      seed: 1,
      map: board(3, 1),
      units: [fighter('a', 'party', 0, 0), fighter('c', 'machines', 1, 0)],
    }, 'a');
    expect(strikeHighlights(state)).toEqual(['c']);
    const cursor = state.rng.cursor;
    expect(planStrike(state, 'c')).toEqual([{ type: 'attack', unitId: 'a', targetId: 'c' }]);
    expect(state.rng.cursor).toBe(cursor);
  });

  it('does not highlight a machine the attack cannot afford', () => {
    const state = activate({
      seed: 1,
      map: board(1, 5),
      units: [fighter('a', 'party', 0, 0), fighter('c', 'machines', 0, 4)],
    }, 'a');
    expect(strikeHighlights(state)).toEqual([]);
    expect(planStrike(state, 'c')).toEqual([]);
    expect(planStrike(state, 'missing')).toEqual([]);
  });

  it('approaches through the nearer cell, breaking ties by smaller y then smaller x', () => {
    const state = activate({
      seed: 1,
      map: board(4, 4),
      units: [fighter('a', 'party', 1, 1), fighter('c', 'machines', 2, 2)],
    }, 'a');
    expect(planStrike(state, 'c')).toEqual([
      { type: 'move', unitId: 'a', to: { x: 2, y: 1 } },
      { type: 'attack', unitId: 'a', targetId: 'c' },
    ]);
  });
});

describe('planMachine', () => {
  it('attacks the living party unit with the lowest hp, then the smaller id', () => {
    const state = activate({
      seed: 1,
      map: board(3, 3),
      units: [
        fighter('b', 'party', 1, 0, { hp: 8 }),
        fighter('a', 'party', 0, 1, { hp: 8 }),
        fighter('c', 'machines', 1, 1, { accuracy: 100, damage: 4 }),
      ],
    }, 'c');
    const cursor = state.rng.cursor;
    expect(planMachine(state)).toEqual([{ type: 'attack', unitId: 'c', targetId: 'a' }]);
    const wounded = activate({
      seed: 1,
      map: board(3, 3),
      units: [
        fighter('a', 'party', 1, 0, { hp: 8 }),
        fighter('b', 'party', 0, 1, { hp: 3 }),
        fighter('c', 'machines', 1, 1),
      ],
    }, 'c');
    expect(planMachine(wounded)).toEqual([{ type: 'attack', unitId: 'c', targetId: 'b' }]);
    expect(state.rng.cursor).toBe(cursor);
  });

  it('walks to the reachable cell strictly closer to the chosen party unit', () => {
    const state = activate({
      seed: 1,
      map: board(4, 1),
      units: [fighter('a', 'party', 3, 0), fighter('c', 'machines', 0, 0)],
    }, 'c');
    expect(planMachine(state)).toEqual([
      { type: 'move', unitId: 'c', to: { x: 1, y: 0 } },
      { type: 'move', unitId: 'c', to: { x: 2, y: 0 } },
    ]);
  });

  it('ends the turn when it cannot attack or get closer', () => {
    const state = activate({
      seed: 1,
      map: board(2, 1),
      units: [fighter('a', 'party', 1, 0), fighter('c', 'machines', 0, 0, { maxAp: 1 })],
    }, 'c');
    expect(planMachine(state)).toEqual([{ type: 'endTurn', unitId: 'c' }]);
    const party = activate({
      seed: 1,
      map: board(2, 1),
      units: [fighter('a', 'party', 0, 0), fighter('c', 'machines', 1, 0)],
    }, 'a');
    expect(planMachine(party)).toEqual([]);
  });
});
