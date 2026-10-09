import { cellAt, inBounds, mapLineOfSight } from './grid';
import type { BattleState, Coord } from './types';

export function lineOfSight(state: BattleState, from: Coord, to: Coord): boolean {
  return mapLineOfSight(state.map, from, to);
}

const DIRS: readonly Coord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function reachable(state: BattleState, unitId: string): Coord[] {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || !unit.alive || unit.ap <= 0) return [];
  const occupied = new Set(
    state.units.filter((candidate) => candidate.alive && candidate.id !== unitId).map((candidate) => `${candidate.pos.x},${candidate.pos.y}`),
  );
  const best = new Map<string, number>([[`${unit.pos.x},${unit.pos.y}`, 0]]);
  const queue: { coord: Coord; steps: number }[] = [{ coord: unit.pos, steps: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.steps === unit.ap) continue;
    for (const dir of DIRS) {
      const next = { x: current.coord.x + dir.x, y: current.coord.y + dir.y };
      const key = `${next.x},${next.y}`;
      const steps = current.steps + 1;
      const known = best.get(key);
      if (known !== undefined && known <= steps) continue;
      if (!inBounds(state.map, next) || occupied.has(key)) continue;
      const dest = cellAt(state.map, next);
      const src = cellAt(state.map, current.coord);
      if (!dest || !src || dest.wall || Math.abs(src.height - dest.height) > 1) continue;
      best.set(key, steps);
      queue.push({ coord: next, steps });
    }
  }
  const cells: Coord[] = [];
  for (const [key, steps] of best) {
    if (steps === 0) continue;
    const [x, y] = key.split(',').map(Number);
    cells.push({ x, y });
  }
  cells.sort((left, right) => left.y - right.y || left.x - right.x);
  return cells;
}
