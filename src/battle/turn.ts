import { apply } from '../core';
import type { BattleEvent, BattleState, Command } from '../core';
import { activeUnit, planMachine } from '../tactics/plan';

function line(event: BattleEvent): string | undefined {
  if (event.type === 'moved') return `${event.unitId} moves to ${event.to.x},${event.to.y}`;
  if (event.type === 'attacked' && event.hit) return `${event.unitId} hits ${event.targetId} for ${event.damage}`;
  if (event.type === 'attacked') return `${event.unitId} misses ${event.targetId}`;
  return undefined;
}

export function runCommands(state: BattleState, commands: readonly Command[]): { state: BattleState; log: string } {
  let log = '';
  for (const command of commands) {
    const result = apply(state, command);
    state = result.state;
    if (!result.ok) break;
    for (const event of result.events) {
      const next = line(event);
      if (next) log = next;
    }
    if (state.status.kind === 'decided') break;
  }
  return { state, log };
}

export function settleMachines(state: BattleState): { state: BattleState; log: string } {
  let log = '';
  for (let guard = 0; guard < 8; guard += 1) {
    const active = activeUnit(state);
    if (!active || active.team !== 'machines') break;
    const played = runCommands(state, planMachine(state));
    state = played.state;
    if (played.log) log = played.log;
    if (state.status.kind === 'decided') break;
    const still = activeUnit(state);
    if (still?.id !== active.id) continue;
    const ended = runCommands(state, [{ type: 'endTurn', unitId: active.id }]);
    state = ended.state;
    if (ended.log) log = ended.log;
  }
  return { state, log };
}
