import { rollD100 } from './rng';
import type { BattleSetup, BattleState, CreateResult, RngState, SetupErrorCode, Unit } from './types';

function isUint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function fail(error: SetupErrorCode): CreateResult {
  return { ok: false, error };
}

function rollInitiative(units: readonly Unit[], rng: RngState): { queue: string[]; rng: RngState } {
  const living = units.filter((unit) => unit.alive).slice().sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const rolls: { id: string; roll: number }[] = [];
  let cursor = rng;
  for (const unit of living) {
    const next = rollD100(cursor);
    rolls.push({ id: unit.id, roll: next.roll });
    cursor = next.rng;
  }
  rolls.sort((left, right) => right.roll - left.roll || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return { queue: rolls.map((entry) => entry.id), rng: cursor };
}

export function createBattle(setup: BattleSetup): CreateResult {
  if (!isUint32(setup.seed)) return fail('bad-seed');
  const board = setup.map;
  if (!board || !isInt(board.width) || !isInt(board.height) || board.width < 1 || board.height < 1 || !Array.isArray(board.cells) || board.cells.length !== board.width * board.height) {
    return fail('bad-map');
  }
  for (const entry of board.cells) {
    if (typeof entry !== 'object' || entry === null || !isInt(entry.height) || entry.height < 0 || !isInt(entry.cover) || entry.cover < 0 || typeof entry.wall !== 'boolean') {
      return fail('bad-cell');
    }
  }
  const seen = new Set<string>();
  for (const unit of setup.units) {
    if (!unit || typeof unit.id !== 'string' || unit.id === '' || typeof unit.team !== 'string' || unit.team === '' || seen.has(unit.id)) return fail('bad-unit');
    seen.add(unit.id);
    if (!isInt(unit.hp) || !isInt(unit.maxHp) || !isInt(unit.maxAp) || !isInt(unit.accuracy) || !isInt(unit.damage)) return fail('bad-unit');
    if (unit.hp < 1 || unit.hp > unit.maxHp || unit.maxAp < 1 || unit.accuracy < 0 || unit.accuracy > 100 || unit.damage < 0) return fail('bad-unit');
  }
  const occupied = new Set<string>();
  for (const unit of setup.units) {
    const pos = unit.pos;
    if (!pos || !isInt(pos.x) || !isInt(pos.y)) return fail('bad-placement');
    if (pos.x < 0 || pos.y < 0 || pos.x >= board.width || pos.y >= board.height) return fail('bad-placement');
    const tile = board.cells[pos.y * board.width + pos.x];
    if (!tile || tile.wall || occupied.has(`${pos.x},${pos.y}`)) return fail('bad-placement');
    occupied.add(`${pos.x},${pos.y}`);
  }
  const teams = new Set(setup.units.map((unit) => unit.team));
  if (teams.size < 2) return fail('need-two-teams');

  const units: Unit[] = setup.units.map((unit) => ({
    id: unit.id,
    team: unit.team,
    pos: { x: unit.pos.x, y: unit.pos.y },
    hp: unit.hp,
    maxHp: unit.maxHp,
    ap: 0,
    maxAp: unit.maxAp,
    accuracy: unit.accuracy,
    damage: unit.damage,
    alive: true,
  }));
  const initiative = rollInitiative(units, { seed: setup.seed, cursor: 0 });
  const activeId = initiative.queue[0];
  const state: BattleState = {
    map: { width: board.width, height: board.height, cells: board.cells.map((entry) => ({ height: entry.height, wall: entry.wall, cover: entry.cover })) },
    units: units.map((unit) => (unit.id === activeId ? { ...unit, ap: unit.maxAp } : unit)),
    round: 1,
    queue: initiative.queue,
    activeIndex: 0,
    rng: initiative.rng,
    status: { kind: 'ongoing' },
  };
  return { ok: true, state };
}
