import { cellAt, inBounds, isOrthogonalNeighbor } from './grid';
import { lineOfSight } from './queries';
import { rollD100 } from './rng';
import { ATTACK_COST, MOVE_COST } from './types';
import type { ApplyErrorCode, ApplyResult, BattleEvent, BattleSetup, BattleState, Command, Coord, CreateResult, RngState, SetupErrorCode, Unit } from './types';

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

function reject(state: BattleState, error: ApplyErrorCode): ApplyResult {
  return { ok: false, error, state };
}

function unitById(state: BattleState, id: string): Unit | undefined {
  return state.units.find((unit) => unit.id === id);
}

function prefix(state: BattleState, unitId: string): ApplyErrorCode | undefined {
  if (state.status.kind === 'decided') return 'battle-over';
  if (!unitById(state, unitId)) return 'unknown-unit';
  if (state.queue[state.activeIndex] !== unitId) return 'not-active';
  return undefined;
}

function replaceUnit(state: BattleState, unitId: string, next: Unit): BattleState {
  return { ...state, units: state.units.map((unit) => (unit.id === unitId ? next : unit)) };
}

function applyMove(state: BattleState, unitId: string, to: Coord): ApplyResult {
  const error = prefix(state, unitId);
  if (error) return reject(state, error);
  const unit = unitById(state, unitId);
  if (!unit) return reject(state, 'unknown-unit');
  if (unit.ap < MOVE_COST) return reject(state, 'not-enough-ap');
  if (!inBounds(state.map, to)) return reject(state, 'out-of-bounds');
  if (!isOrthogonalNeighbor(unit.pos, to)) return reject(state, 'not-adjacent');
  const dest = cellAt(state.map, to);
  if (!dest || dest.wall) return reject(state, 'wall');
  if (state.units.some((other) => other.alive && other.pos.x === to.x && other.pos.y === to.y)) return reject(state, 'occupied');
  const src = cellAt(state.map, unit.pos);
  if (!src || Math.abs(src.height - dest.height) > 1) return reject(state, 'climb');
  const ap = unit.ap - MOVE_COST;
  const next = replaceUnit(state, unitId, { ...unit, pos: { x: to.x, y: to.y }, ap });
  return { ok: true, state: next, events: [{ type: 'moved', unitId, from: unit.pos, to: { x: to.x, y: to.y }, ap }] };
}

function livingTeams(units: readonly Unit[]): Set<string> {
  return new Set(units.filter((unit) => unit.alive).map((unit) => unit.team));
}

function applyAttack(state: BattleState, unitId: string, targetId: string): ApplyResult {
  const error = prefix(state, unitId);
  if (error) return reject(state, error);
  const attacker = unitById(state, unitId);
  if (!attacker) return reject(state, 'unknown-unit');
  if (attacker.ap < ATTACK_COST) return reject(state, 'not-enough-ap');
  const target = unitById(state, targetId);
  if (!target) return reject(state, 'unknown-target');
  if (!target.alive) return reject(state, 'dead-target');
  if (target.team === attacker.team) return reject(state, 'same-team');
  if (!isOrthogonalNeighbor(attacker.pos, target.pos)) return reject(state, 'not-adjacent');
  if (!lineOfSight(state, attacker.pos, target.pos)) return reject(state, 'no-sight');
  const cover = cellAt(state.map, target.pos)?.cover ?? 0;
  const chance = Math.min(100, Math.max(0, attacker.accuracy - cover * 20));
  const rolled = rollD100(state.rng);
  const hit = rolled.roll <= chance;
  const damage = hit ? Math.max(0, attacker.damage - cover) : 0;
  const targetHp = Math.max(0, target.hp - damage);
  let units = state.units.map((unit) => {
    if (unit.id === attacker.id) return { ...unit, ap: unit.ap - ATTACK_COST };
    if (unit.id === target.id) return { ...unit, hp: targetHp, alive: targetHp > 0, ap: targetHp > 0 ? unit.ap : 0 };
    return unit;
  });
  const events: BattleEvent[] = [{ type: 'attacked', unitId, targetId, hit, roll: rolled.roll, chance, damage, targetHp }];
  if (targetHp === 0) events.push({ type: 'unitDown', unitId: targetId });
  let status = state.status;
  if (livingTeams(units).size === 1) {
    const winner = units.find((unit) => unit.alive)?.team ?? attacker.team;
    status = { kind: 'decided', winner };
    events.push({ type: 'battleDecided', winner });
  }
  return { ok: true, state: { ...state, units, rng: rolled.rng, status }, events };
}

function applyEndTurn(state: BattleState, unitId: string): ApplyResult {
  const error = prefix(state, unitId);
  if (error) return reject(state, error);
  const cleared = replaceUnit(state, unitId, { ...unitById(state, unitId)!, ap: 0 });
  const events: BattleEvent[] = [{ type: 'turnEnded', unitId }];
  let index = cleared.activeIndex + 1;
  while (index < cleared.queue.length && !unitById(cleared, cleared.queue[index])?.alive) index += 1;
  if (index < cleared.queue.length) {
    const nextId = cleared.queue[index];
    const nextUnit = unitById(cleared, nextId);
    if (!nextUnit) return reject(state, 'unknown-unit');
    events.push({ type: 'turnStarted', unitId: nextId, ap: nextUnit.maxAp });
    return { ok: true, state: { ...replaceUnit(cleared, nextId, { ...nextUnit, ap: nextUnit.maxAp }), activeIndex: index }, events };
  }
  if (livingTeams(cleared.units).size < 2) return { ok: true, state: cleared, events };
  const initiative = rollInitiative(cleared.units, cleared.rng);
  const firstId = initiative.queue[0];
  const first = unitById(cleared, firstId);
  if (!first) return reject(state, 'unknown-unit');
  events.push({ type: 'roundStarted', round: cleared.round + 1, queue: initiative.queue });
  events.push({ type: 'turnStarted', unitId: firstId, ap: first.maxAp });
  return {
    ok: true,
    state: {
      ...replaceUnit(cleared, firstId, { ...first, ap: first.maxAp }),
      round: cleared.round + 1,
      queue: initiative.queue,
      activeIndex: 0,
      rng: initiative.rng,
    },
    events,
  };
}

export function apply(state: BattleState, command: Command): ApplyResult {
  switch (command.type) {
    case 'move':
      return applyMove(state, command.unitId, command.to);
    case 'attack':
      return applyAttack(state, command.unitId, command.targetId);
    case 'endTurn':
      return applyEndTurn(state, command.unitId);
  }
}
