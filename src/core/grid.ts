import type { Cell, Coord, GameMap } from './types';

export function inBounds(map: GameMap, coord: Coord): boolean {
  return coord.x >= 0 && coord.y >= 0 && coord.x < map.width && coord.y < map.height;
}

export function cellAt(map: GameMap, coord: Coord): Cell | undefined {
  if (!inBounds(map, coord)) return undefined;
  return map.cells[coord.y * map.width + coord.x];
}

export function isOrthogonalNeighbor(a: Coord, b: Coord): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

export function supercoverCells(from: Coord, to: Coord): Coord[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const sx = sign(dx);
  const sy = sign(dy);
  const cells: Coord[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  let ix = 0;
  let iy = 0;
  while (ix < nx || iy < ny) {
    if (nx === 0) {
      y += sy;
      iy += 1;
    } else if (ny === 0) {
      x += sx;
      ix += 1;
    } else {
      const left = (2 * ix + 1) * ny;
      const right = (2 * iy + 1) * nx;
      if (left === right) {
        cells.push({ x: x + sx, y });
        cells.push({ x, y: y + sy });
        x += sx;
        y += sy;
        ix += 1;
        iy += 1;
      } else if (left < right) {
        x += sx;
        ix += 1;
      } else {
        y += sy;
        iy += 1;
      }
    }
    cells.push({ x, y });
  }
  return cells;
}

function aboveRay(map: GameMap, from: Coord, to: Coord, cell: Coord): boolean {
  const start = cellAt(map, from);
  const end = cellAt(map, to);
  const mid = cellAt(map, cell);
  if (!start || !end || !mid) return false;
  const h0 = start.height + 1;
  const h1 = end.height + 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy;
  let dot = (cell.x - from.x) * dx + (cell.y - from.y) * dy;
  if (dot < 0) dot = 0;
  if (dot > len2) dot = len2;
  return (mid.height - h0) * len2 > dot * (h1 - h0);
}

export function mapLineOfSight(map: GameMap, from: Coord, to: Coord): boolean {
  if (!inBounds(map, from) || !inBounds(map, to)) return false;
  const start = cellAt(map, from);
  const end = cellAt(map, to);
  if (!start || !end || start.wall || end.wall) return false;
  if (from.x === to.x && from.y === to.y) return true;
  if (isOrthogonalNeighbor(from, to)) return Math.abs(start.height - end.height) <= 1;
  const seen = new Set<string>();
  for (const cell of supercoverCells(from, to)) {
    if ((cell.x === from.x && cell.y === from.y) || (cell.x === to.x && cell.y === to.y)) continue;
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mid = cellAt(map, cell);
    if (mid?.wall || aboveRay(map, from, to, cell)) return false;
  }
  return true;
}
