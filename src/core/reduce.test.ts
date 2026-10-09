import { describe, expect, it } from 'vitest';
import { apply, createBattle } from './reduce';
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

describe('move', () => {
  function started(board = map(3, 1, [cell(), cell(), cell()])) {
    const created = createBattle(setup(2, [
      fighter('a', 'party', 0, 0),
      fighter('b', 'machines', 2, 0),
    ], board));
    if (!created.ok) throw new Error(created.error);
    return created.state;
  }

  it('steps onto an orthogonal cell and spends 1 action point', () => {
    const state = started();
    const result = apply(state, { type: 'move', unitId: 'a', to: { x: 1, y: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([{ type: 'moved', unitId: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, ap: 2 }]);
    expect(state.units.find((unit) => unit.id === 'a')?.pos).toEqual({ x: 0, y: 0 });
    expect(state.units.find((unit) => unit.id === 'a')?.ap).toBe(3);
  });

  it('rejects illegal steps in spec order without changing state', () => {
    const state = started();
    const decided = { ...state, status: { kind: 'decided' as const, winner: 'party' } };
    expect(apply(decided, { type: 'move', unitId: 'a', to: { x: 1, y: 0 } })).toMatchObject({ ok: false, error: 'battle-over' });
    expect(apply(decided, { type: 'move', unitId: 'a', to: { x: 1, y: 0 } }).state).toBe(decided);
    expect(apply(state, { type: 'move', unitId: 'missing', to: { x: 1, y: 0 } })).toMatchObject({ ok: false, error: 'unknown-unit' });
    expect(apply(state, { type: 'move', unitId: 'b', to: { x: 1, y: 0 } })).toMatchObject({ ok: false, error: 'not-active' });
    const broke = { ...state, units: state.units.map((unit) => ({ ...unit, ap: 0 })) };
    expect(apply(broke, { type: 'move', unitId: 'a', to: { x: 1, y: 0 } })).toMatchObject({ ok: false, error: 'not-enough-ap' });
    expect(apply(state, { type: 'move', unitId: 'a', to: { x: 0, y: 1 } })).toMatchObject({ ok: false, error: 'out-of-bounds' });
    expect(apply(state, { type: 'move', unitId: 'a', to: { x: 0, y: 0 } })).toMatchObject({ ok: false, error: 'not-adjacent' });
    expect(apply(state, { type: 'move', unitId: 'a', to: { x: 2, y: 0 } })).toMatchObject({ ok: false, error: 'not-adjacent' });
    const diagonal = createBattle(setup(2, [
      fighter('a', 'party', 0, 0),
      fighter('b', 'machines', 1, 1),
    ], map(2, 2)));
    if (!diagonal.ok) throw new Error(diagonal.error);
    expect(apply(diagonal.state, { type: 'move', unitId: 'a', to: { x: 1, y: 1 } })).toMatchObject({ ok: false, error: 'not-adjacent' });
    const walled = started(map(3, 1, [cell(), cell(0, true), cell()]));
    expect(apply(walled, { type: 'move', unitId: 'a', to: { x: 1, y: 0 } })).toMatchObject({ ok: false, error: 'wall' });
    const crowded = started();
    const blocked = { ...crowded, units: crowded.units.map((unit) => unit.id === 'b' ? { ...unit, pos: { x: 1, y: 0 } } : unit) };
    expect(apply(blocked, { type: 'move', unitId: 'a', to: { x: 1, y: 0 } })).toMatchObject({ ok: false, error: 'occupied' });
    const steep = started(map(3, 1, [cell(0), cell(2), cell()]));
    expect(apply(steep, { type: 'move', unitId: 'a', to: { x: 1, y: 0 } })).toMatchObject({ ok: false, error: 'climb' });
    const step = started(map(3, 1, [cell(0), cell(1), cell()]));
    expect(apply(step, { type: 'move', unitId: 'a', to: { x: 1, y: 0 } }).ok).toBe(true);
    expect(apply(state, { type: 'move', unitId: 'a', to: { x: 3, y: 0 } }).state).toBe(state);
  });
});

describe('attack', () => {
  function started(extra: Partial<SetupUnit> = {}, board = map(3, 3)) {
    const created = createBattle(setup(2, [
      fighter('a', 'party', 0, 0, { accuracy: 100, damage: 5, ...extra }),
      fighter('b', 'machines', 1, 0),
    ], board));
    if (!created.ok) throw new Error(created.error);
    return created.state;
  }

  it('hits for full damage when the fixed roll is inside the chance', () => {
    const state = started();
    const result = apply(state, { type: 'attack', unitId: 'a', targetId: 'b' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([
      { type: 'attacked', unitId: 'a', targetId: 'b', hit: true, roll: 17, chance: 100, damage: 5, targetHp: 5 },
    ]);
    expect(result.state.units.find((unit) => unit.id === 'a')?.ap).toBe(1);
    expect(result.state.rng.cursor).toBe(3);
    expect(state.units.find((unit) => unit.id === 'b')?.hp).toBe(10);
  });

  it('misses when accuracy is below the roll and still spends the cost', () => {
    const state = started({ accuracy: 10 });
    const result = apply(state, { type: 'attack', unitId: 'a', targetId: 'b' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([
      { type: 'attacked', unitId: 'a', targetId: 'b', hit: false, roll: 17, chance: 10, damage: 0, targetHp: 10 },
    ]);
  });

  it('reduces chance and damage by cover on a hit', () => {
    const board = map(3, 3);
    const cells = board.cells.slice();
    cells[1] = cell(0, false, 1);
    const state = started({}, { ...board, cells });
    const result = apply(state, { type: 'attack', unitId: 'a', targetId: 'b' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]).toMatchObject({ hit: true, roll: 17, chance: 80, damage: 4, targetHp: 6 });
  });

  it('rejects a bad target without rolling', () => {
    const state = started();
    expect(apply(state, { type: 'attack', unitId: 'a', targetId: 'nobody' })).toMatchObject({ ok: false, error: 'unknown-target' });
    expect(apply(state, { type: 'attack', unitId: 'a', targetId: 'a' })).toMatchObject({ ok: false, error: 'same-team' });
    expect(apply(started({ maxAp: 1 }), { type: 'attack', unitId: 'a', targetId: 'b' })).toMatchObject({ ok: false, error: 'not-enough-ap' });
    const diagonal = createBattle(setup(2, [
      fighter('a', 'party', 0, 0, { accuracy: 100, damage: 5 }),
      fighter('b', 'machines', 1, 1),
    ], map(3, 3)));
    if (!diagonal.ok) throw new Error(diagonal.error);
    expect(apply(diagonal.state, { type: 'attack', unitId: 'a', targetId: 'b' })).toMatchObject({ ok: false, error: 'not-adjacent' });
    const steep = started({}, map(3, 3, [cell(0), cell(2), cell(), cell(), cell(), cell(), cell(), cell(), cell()]));
    const movedTarget = {
      ...steep,
      units: steep.units.map((unit) => unit.id === 'b' ? { ...unit, pos: { x: 1, y: 0 } } : unit),
    };
    expect(apply(movedTarget, { type: 'attack', unitId: 'a', targetId: 'b' })).toMatchObject({ ok: false, error: 'no-sight' });
    expect(apply(state, { type: 'attack', unitId: 'a', targetId: 'nobody' }).state).toBe(state);
  });

  it('removes the last enemy and ends the battle in the same apply', () => {
    const state = started({ damage: 10 });
    const result = apply(state, { type: 'attack', unitId: 'a', targetId: 'b' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.map((event) => event.type)).toEqual(['attacked', 'unitDown', 'battleDecided']);
    expect(result.state.status).toEqual({ kind: 'decided', winner: 'party' });
    expect(result.state.units.find((unit) => unit.id === 'b')).toMatchObject({ alive: false, hp: 0, ap: 0 });
    expect(apply(result.state, { type: 'endTurn', unitId: 'a' })).toMatchObject({ ok: false, error: 'battle-over' });
  });

  it('reports a dead target while another enemy remains', () => {
  const created = createBattle(setup(25, [
    fighter('a', 'party', 1, 1, { accuracy: 100, damage: 10, maxAp: 5 }),
    fighter('b', 'machines', 1, 0),
    fighter('c', 'machines', 0, 1),
  ], map(3, 3)));
  if (!created.ok) throw new Error(created.error);
  const first = apply(created.state, { type: 'attack', unitId: 'a', targetId: 'b' });
  if (!first.ok) throw new Error('expected the kill to land');
  expect(first.state.status).toEqual({ kind: 'ongoing' });
    expect(apply(first.state, { type: 'attack', unitId: 'a', targetId: 'b' })).toMatchObject({ ok: false, error: 'dead-target' });
  });
});

describe('endTurn', () => {
  it('discards remaining points and passes to the next living unit', () => {
    const created = createBattle(setup(1, [
      fighter('a', 'party', 0, 0),
      fighter('b', 'machines', 1, 0),
    ]));
    if (!created.ok) throw new Error(created.error);
    const result = apply(created.state, { type: 'endTurn', unitId: 'b' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([
      { type: 'turnEnded', unitId: 'b' },
      { type: 'turnStarted', unitId: 'a', ap: 3 },
    ]);
    expect(result.state.units.find((unit) => unit.id === 'b')?.ap).toBe(0);
    expect(result.state.activeIndex).toBe(1);
  });

  it('rerolls initiative when the queue is exhausted', () => {
    const created = createBattle(setup(1, [
      fighter('a', 'party', 0, 0),
      fighter('b', 'machines', 1, 0),
    ]));
    if (!created.ok) throw new Error(created.error);
    const first = apply(created.state, { type: 'endTurn', unitId: 'b' });
    if (!first.ok) throw new Error('expected the handoff');
    const second = apply(first.state, { type: 'endTurn', unitId: 'a' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.round).toBe(2);
    expect(second.state.queue).toEqual(['a', 'b']);
    expect(second.events).toEqual([
      { type: 'turnEnded', unitId: 'a' },
      { type: 'roundStarted', round: 2, queue: ['a', 'b'] },
      { type: 'turnStarted', unitId: 'a', ap: 3 },
    ]);
  });

  it('skips a dead unit without starting their turn', () => {
    const created = createBattle(setup(25, [
      fighter('a', 'party', 1, 1, { accuracy: 100, damage: 10, maxAp: 5 }),
      fighter('b', 'machines', 1, 0),
      fighter('c', 'machines', 0, 1),
    ], map(3, 3)));
    if (!created.ok) throw new Error(created.error);
    expect(created.state.queue).toEqual(['a', 'c', 'b']);
    const killed = apply(created.state, { type: 'attack', unitId: 'a', targetId: 'b' });
    if (!killed.ok) throw new Error('expected a kill');
    const toC = apply(killed.state, { type: 'endTurn', unitId: 'a' });
    if (!toC.ok) throw new Error('expected c to act');
    expect(toC.events).toEqual([
      { type: 'turnEnded', unitId: 'a' },
      { type: 'turnStarted', unitId: 'c', ap: 3 },
    ]);
    const nextRound = apply(toC.state, { type: 'endTurn', unitId: 'c' });
    expect(nextRound.ok).toBe(true);
    if (!nextRound.ok) return;
    expect(nextRound.state.round).toBe(2);
    expect(nextRound.state.queue).toEqual(['a', 'c']);
    expect(nextRound.events.some((event) => event.type === 'turnStarted' && event.unitId === 'b')).toBe(false);
  });
});

describe('determinism', () => {
  it('repeats the same commands into the same state and events', () => {
    const run = () => {
      const created = createBattle(setup(2, [
        fighter('a', 'party', 0, 0, { accuracy: 100, damage: 5 }),
        fighter('b', 'machines', 2, 0),
      ], map(3, 1)));
      if (!created.ok) throw new Error(created.error);
      const moved = apply(created.state, { type: 'move', unitId: 'a', to: { x: 1, y: 0 } });
      if (!moved.ok) throw new Error('move failed');
      const attacked = apply(moved.state, { type: 'attack', unitId: 'a', targetId: 'b' });
      return { state: attacked.ok ? attacked.state : attacked, events: attacked.ok ? attacked.events : [] };
    };
    expect(run()).toEqual(run());
  });
});
