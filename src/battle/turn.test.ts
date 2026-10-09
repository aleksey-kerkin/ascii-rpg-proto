import { describe, expect, it } from 'vitest';
import { createBattle } from '../core';
import type { BattleSetup, BattleState, Cell, SetupUnit } from '../core';
import { runCommands, settleMachines } from './turn';

function cell(): Cell {
  return { height: 0, wall: false, cover: 0 };
}

function board(width: number, height: number): BattleSetup['map'] {
  return { width, height, cells: Array.from({ length: width * height }, () => cell()) };
}

function fighter(id: string, team: string, x: number, y: number, extra: Partial<SetupUnit> = {}): SetupUnit {
  return { id, team, pos: { x, y }, hp: 8, maxHp: 8, maxAp: 3, accuracy: 100, damage: 4, ...extra };
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

describe('runCommands', () => {
  it('applies until a command is refused and keeps the latest move or attack line', () => {
    const state = activate({
      seed: 1,
      map: board(3, 1),
      units: [fighter('a', 'party', 0, 0), fighter('c', 'machines', 2, 0)],
    }, 'a');
    const moved = runCommands(state, [
      { type: 'move', unitId: 'a', to: { x: 1, y: 0 } },
      { type: 'move', unitId: 'a', to: { x: 9, y: 0 } },
    ]);
    expect(moved.state.units.find((unit) => unit.id === 'a')?.pos).toEqual({ x: 1, y: 0 });
    expect(moved.log).toBe('a moves to 1,0');
    const strike = runCommands(moved.state, [{ type: 'attack', unitId: 'a', targetId: 'c' }]);
    expect(strike.log).toBe('a hits c for 4');
    expect(strike.state.units.find((unit) => unit.id === 'c')?.hp).toBe(4);
  });
});

describe('settleMachines', () => {
  it('plays the strike and burns the machine remainder while the battle continues', () => {
    const state = activate({
      seed: 1,
      map: board(3, 1),
      units: [fighter('a', 'party', 0, 0), fighter('c', 'machines', 1, 0, { accuracy: 100, damage: 4 })],
    }, 'c');
    const settled = settleMachines(state);
    expect(settled.log).toBe('c hits a for 4');
    expect(settled.state.units.find((unit) => unit.id === 'a')?.hp).toBe(4);
    expect(settled.state.queue[settled.state.activeIndex]).toBe('a');
  });

  it('does not send endTurn after the killing blow decides the battle', () => {
    const state = activate({
      seed: 1,
      map: board(3, 1),
      units: [fighter('a', 'party', 0, 0, { hp: 4, maxHp: 4 }), fighter('c', 'machines', 1, 0, { accuracy: 100, damage: 4 })],
    }, 'c');
    const settled = settleMachines(state);
    expect(settled.state.status).toEqual({ kind: 'decided', winner: 'machines' });
    expect(settled.log).toBe('c hits a for 4');
  });
});
