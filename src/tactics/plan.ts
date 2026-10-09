import { apply, reachable } from '../core';
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
