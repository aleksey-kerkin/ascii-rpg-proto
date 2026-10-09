import type { BattleSetup, Cell, SetupUnit } from '../core';

const open: Cell = { height: 0, wall: false, cover: 0 };

function cell(x: number, y: number): Cell {
  if ((x === 3 && y === 0) || (x === 3 && y === 1)) return { height: 0, wall: true, cover: 0 };
  if ((x === 4 && y === 1) || (x === 4 && y === 2)) return { height: 1, wall: false, cover: 0 };
  if ((x === 2 && y === 2) || (x === 5 && y === 3)) return { height: 0, wall: false, cover: 1 };
  return open;
}

function unit(id: string, team: string, x: number, y: number): SetupUnit {
  return { id, team, pos: { x, y }, hp: 8, maxHp: 8, maxAp: 3, accuracy: 80, damage: 4 };
}

const width = 8;
const height = 6;
const cells: Cell[] = [];
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) cells.push(cell(x, y));
}

export const firstEncounter: BattleSetup = {
  seed: 1,
  map: { width, height, cells },
  units: [unit('a', 'party', 1, 1), unit('b', 'party', 1, 4), unit('c', 'machines', 6, 1), unit('d', 'machines', 6, 4)],
};
