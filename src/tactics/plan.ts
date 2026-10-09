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
