import type { Beat } from './turn';

export function spawnBeats(unitIds: readonly string[], robotIds: readonly string[]): Beat[] {
  const robots = new Set(robotIds);
  return unitIds.map((unitId) => ({
    kind: 'spawn',
    unitId,
    lines: robots.has(unitId) ? [unitId, 'online'] : [unitId],
  }));
}
