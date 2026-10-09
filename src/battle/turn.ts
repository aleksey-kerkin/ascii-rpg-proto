import { apply } from '../core';
import type { BattleEvent, BattleState, Command, Coord } from '../core';
import { activeUnit, planMachine } from '../tactics/plan';

export type Beat =
  | { kind: 'spawn'; unitId: string; lines: readonly string[] }
  | { kind: 'step'; unitId: string; to: Coord }
  | { kind: 'strike'; unitId: string; targetId: string; text: string };

export type Script = { state: BattleState; beats: Beat[]; log: string };

function line(event: BattleEvent): string | undefined {
  if (event.type === 'moved') return `${event.unitId} moves to ${event.to.x},${event.to.y}`;
  if (event.type === 'attacked' && event.hit) return `${event.unitId} hits ${event.targetId} for ${event.damage}`;
  if (event.type === 'attacked') return `${event.unitId} misses ${event.targetId}`;
  return undefined;
}

function beatOf(event: BattleEvent): Beat | undefined {
  if (event.type === 'moved') return { kind: 'step', unitId: event.unitId, to: event.to };
  if (event.type === 'attacked') {
    return {
      kind: 'strike',
      unitId: event.unitId,
      targetId: event.targetId,
      text: event.hit ? `-${event.damage}` : 'miss',
    };
  }
  return undefined;
}

export function scriptCommands(state: BattleState, commands: readonly Command[]): Script {
  const beats: Beat[] = [];
  let log = '';
  for (const command of commands) {
    const result = apply(state, command);
    state = result.state;
    if (!result.ok) break;
    for (const event of result.events) {
      const next = line(event);
      if (next) log = next;
      const beat = beatOf(event);
      if (beat) beats.push(beat);
    }
    if (state.status.kind === 'decided') break;
  }
  return { state, beats, log };
}

export function runCommands(state: BattleState, commands: readonly Command[]): { state: BattleState; log: string } {
  const played = scriptCommands(state, commands);
  return { state: played.state, log: played.log };
}

export function scriptSettle(state: BattleState): Script {
  const beats: Beat[] = [];
  let log = '';
  for (let guard = 0; guard < 8; guard += 1) {
    const active = activeUnit(state);
    if (!active || active.team !== 'machines') break;
    const played = scriptCommands(state, planMachine(state));
    state = played.state;
    beats.push(...played.beats);
    if (played.log) log = played.log;
    if (state.status.kind === 'decided') break;
    const still = activeUnit(state);
    if (still?.id !== active.id) continue;
    const ended = scriptCommands(state, [{ type: 'endTurn', unitId: active.id }]);
    state = ended.state;
    beats.push(...ended.beats);
    if (ended.log) log = ended.log;
  }
  return { state, beats, log };
}

export function settleMachines(state: BattleState): { state: BattleState; log: string } {
  const played = scriptSettle(state);
  return { state: played.state, log: played.log };
}
