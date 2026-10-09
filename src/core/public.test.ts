import { describe, expect, it } from 'vitest';
import { apply, ATTACK_COST, createBattle, lineOfSight, MOVE_COST, reachable } from './index';

describe('public surface', () => {
  it('exports the battle operations and the action costs', () => {
    expect(MOVE_COST).toBe(1);
    expect(ATTACK_COST).toBe(2);
    expect(typeof createBattle).toBe('function');
    expect(typeof apply).toBe('function');
    expect(typeof lineOfSight).toBe('function');
    expect(typeof reachable).toBe('function');
  });
});
