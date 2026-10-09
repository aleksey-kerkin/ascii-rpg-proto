import { apply, reachable } from '../core';
import { cellAt, inBounds } from '../core/grid';
import type { BattleState, Command, Coord, Unit } from '../core';

const DIRS: readonly Coord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function key(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

export function activeUnit(state: BattleState): Unit | undefined {
  if (state.status.kind !== 'ongoing') return undefined;
  const id = state.queue[state.activeIndex];
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit?.alive) return undefined;
  return unit;
}

function pathTo(state: BattleState, unitId: string, to: Coord): Coord[] {
  const unit = activeUnit(state);
  if (!unit || unit.id !== unitId) return [];
  if (unit.pos.x === to.x && unit.pos.y === to.y) return [];
  const previous = new Map<string, Coord>();
  const seen = new Set<string>([key(unit.pos)]);
  const queue: { state: BattleState; at: Coord }[] = [{ state, at: unit.pos }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const dir of DIRS) {
      const next = { x: current.at.x + dir.x, y: current.at.y + dir.y };
      const id = key(next);
      if (seen.has(id)) continue;
      const stepped = apply(current.state, { type: 'move', unitId, to: next });
      if (!stepped.ok) continue;
      seen.add(id);
      previous.set(id, current.at);
      if (next.x === to.x && next.y === to.y) {
        const cells: Coord[] = [next];
        let walk = key(current.at);
        while (walk !== key(unit.pos)) {
          const prior = previous.get(walk);
          if (!prior) break;
          const [x, y] = walk.split(',').map(Number);
          cells.push({ x, y });
          walk = key(prior);
        }
        cells.reverse();
        return cells;
      }
      queue.push({ state: stepped.state, at: next });
    }
  }
  return [];
}

export function planMove(state: BattleState, to: Coord): Command[] {
  const unit = activeUnit(state);
  if (!unit) return [];
  if (!reachable(state, unit.id).some((coord) => coord.x === to.x && coord.y === to.y)) return [];
  return pathTo(state, unit.id, to).map((coord) => ({ type: 'move', unitId: unit.id, to: coord }));
}

export function moveHighlights(state: BattleState): Coord[] {
  const unit = activeUnit(state);
  if (!unit || unit.team !== 'party') return [];
  return reachable(state, unit.id);
}

export function planStrike(state: BattleState, targetId: string): Command[] {
  const unit = activeUnit(state);
  if (!unit || !state.units.some((candidate) => candidate.id === targetId && candidate.alive)) return [];
  let best: { steps: number; y: number; x: number; commands: Command[] } | undefined;
  const consider = (sim: BattleState, steps: Coord[], at: Coord) => {
    const attack = apply(sim, { type: 'attack', unitId: unit.id, targetId });
    if (!attack.ok) return;
    const candidate = {
      steps: steps.length,
      y: at.y,
      x: at.x,
      commands: [
        ...steps.map((coord) => ({ type: 'move' as const, unitId: unit.id, to: coord })),
        { type: 'attack' as const, unitId: unit.id, targetId },
      ],
    };
    if (
      !best
      || candidate.steps < best.steps
      || (candidate.steps === best.steps && (candidate.y < best.y || (candidate.y === best.y && candidate.x < best.x)))
    ) {
      best = candidate;
    }
  };
  consider(state, [], unit.pos);
  const seen = new Set<string>([key(unit.pos)]);
  const queue: { state: BattleState; at: Coord; steps: Coord[] }[] = [{ state, at: unit.pos, steps: [] }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const dir of DIRS) {
      const next = { x: current.at.x + dir.x, y: current.at.y + dir.y };
      if (seen.has(key(next))) continue;
      const stepped = apply(current.state, { type: 'move', unitId: unit.id, to: next });
      if (!stepped.ok) continue;
      seen.add(key(next));
      const steps = [...current.steps, next];
      consider(stepped.state, steps, next);
      queue.push({ state: stepped.state, at: next, steps });
    }
  }
  return best?.commands ?? [];
}

export function strikeHighlights(state: BattleState): string[] {
  const unit = activeUnit(state);
  if (!unit || unit.team !== 'party') return [];
  return state.units
    .filter((candidate) => candidate.alive && candidate.team === 'machines' && planStrike(state, candidate.id).length > 0)
    .map((candidate) => candidate.id);
}

function occupant(state: BattleState, pos: Coord, exceptId: string): boolean {
  return state.units.some((unit) => unit.alive && unit.id !== exceptId && unit.pos.x === pos.x && unit.pos.y === pos.y);
}

function place(state: BattleState, unitId: string, pos: Coord): BattleState {
  return {
    ...state,
    units: state.units.map((unit) => (unit.id === unitId ? { ...unit, pos, ap: 1000 } : unit)),
  };
}

function distancesTo(state: BattleState, travelerId: string, targetId: string): Map<string, number> {
  const target = state.units.find((unit) => unit.id === targetId && unit.alive);
  const dist = new Map<string, number>();
  if (!target) return dist;
  dist.set(key(target.pos), 0);
  const queue: Coord[] = [target.pos];
  while (queue.length > 0) {
    const cell = queue.shift();
    if (!cell) break;
    const base = dist.get(key(cell));
    if (base === undefined) continue;
    for (const dir of DIRS) {
      const next = { x: cell.x + dir.x, y: cell.y + dir.y };
      if (dist.has(key(next)) || !inBounds(state.map, next) || occupant(state, next, travelerId)) continue;
      const stood = cellAt(state.map, next);
      if (!stood || stood.wall) continue;
      const step = apply(place(state, travelerId, next), { type: 'move', unitId: travelerId, to: cell });
      const ontoTarget = cell.x === target.pos.x && cell.y === target.pos.y;
      if (!step.ok && !(ontoTarget && step.error === 'occupied')) continue;
      dist.set(key(next), base + 1);
      queue.push(next);
    }
  }
  return dist;
}

export function planMachine(state: BattleState): Command[] {
  const active = activeUnit(state);
  if (!active || active.team !== 'machines') return [];
  const allies = state.units
    .filter((unit) => unit.alive && unit.team === 'party')
    .sort((left, right) => left.hp - right.hp || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  for (const ally of allies) {
    const strike = planStrike(state, ally.id);
    if (strike.length > 0) return strike;
  }
  let chosen: { id: string; dist: number } | undefined;
  for (const ally of state.units.filter((unit) => unit.alive && unit.team === 'party')) {
    const dist = distancesTo(state, active.id, ally.id).get(key(active.pos));
    if (dist === undefined) continue;
    if (!chosen || dist < chosen.dist || (dist === chosen.dist && ally.id < chosen.id)) chosen = { id: ally.id, dist };
  }
  if (!chosen) return [{ type: 'endTurn', unitId: active.id }];
  const metric = distancesTo(state, active.id, chosen.id);
  const here = metric.get(key(active.pos));
  let goal: Coord | undefined;
  for (const coord of reachable(state, active.id)) {
    const dist = metric.get(key(coord));
    if (here === undefined || dist === undefined || dist >= here) continue;
    const goalDist = goal ? metric.get(key(goal)) : undefined;
    if (
      !goal
      || goalDist === undefined
      || dist < goalDist
      || (dist === goalDist && (coord.y < goal.y || (coord.y === goal.y && coord.x < goal.x)))
    ) {
      goal = coord;
    }
  }
  if (!goal) return [{ type: 'endTurn', unitId: active.id }];
  const walk = planMove(state, goal);
  return walk.length > 0 ? walk : [{ type: 'endTurn', unitId: active.id }];
}
