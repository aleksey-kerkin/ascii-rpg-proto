import { describe, expect, it } from 'vitest';
import { mapLineOfSight, supercoverCells } from './grid';
import type { Cell, GameMap } from './types';

function mapFrom(rows: readonly (readonly Cell[])[]): GameMap {
  return { width: rows[0].length, height: rows.length, cells: rows.flat() };
}

const open = (height = 0, wall = false, cover = 0): Cell => ({ height, wall, cover });

describe('supercoverCells', () => {
  it('walks an orthogonal line through every cell', () => {
    expect(supercoverCells({ x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('includes both side cells when a diagonal crosses a corner', () => {
    expect(supercoverCells({ x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });
});

describe('mapLineOfSight', () => {
  it('rejects coordinates outside the map and wall endpoints', () => {
    const map = mapFrom([[open(), open()]]);
    expect(mapLineOfSight(map, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(mapLineOfSight(map, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    const walled = mapFrom([[open(), { height: 0, wall: true, cover: 0 }]]);
    expect(mapLineOfSight(walled, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
  });

  it('sees an orthogonal neighbor only when the height delta is at most 1', () => {
    expect(mapLineOfSight(mapFrom([[open(0), open(1)]]), { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
    expect(mapLineOfSight(mapFrom([[open(0), open(2)]]), { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
  });

  it('blocks on an intermediate wall or a cell strictly above the ray', () => {
    const clear = mapFrom([[open(0), open(1), open(0)]]);
    const high = mapFrom([[open(0), open(2), open(0)]]);
    const wall = mapFrom([[open(0), { height: 0, wall: true, cover: 0 }, open(0)]]);
    expect(mapLineOfSight(clear, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
    expect(mapLineOfSight(high, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(mapLineOfSight(wall, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it('closes a diagonal gap between two walls', () => {
    const blocked = mapFrom([
      [open(), { height: 0, wall: true, cover: 0 }],
      [{ height: 0, wall: true, cover: 0 }, open()],
    ]);
    const openDiagonal = mapFrom([
      [open(), open()],
      [open(), open()],
    ]);
    expect(mapLineOfSight(blocked, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
    expect(mapLineOfSight(openDiagonal, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  });
});
