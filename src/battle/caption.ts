export const TYPE_MS = 45;
export const HOLD_MS = 350;
export const FADE_MS = 250;

export function captionFrame(lines: readonly string[], elapsedMs: number): { text: string; alpha: number; done: boolean } {
  let t = Math.max(0, elapsedMs);
  if (lines.length === 0) return { text: '', alpha: 0, done: true };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const typedAt = Math.max(0, line.length - 1) * TYPE_MS;
    const holdEnd = typedAt + HOLD_MS;
    const end = holdEnd + FADE_MS;
    const last = i === lines.length - 1;
    if (t < end || last) {
      if (t >= end) return { text: line, alpha: 0, done: true };
      if (t < typedAt) {
        const count = Math.floor(t / TYPE_MS) + 1;
        return { text: line.slice(0, count), alpha: 1, done: false };
      }
      if (t < holdEnd) return { text: line, alpha: 1, done: false };
      return { text: line, alpha: 1 - (t - holdEnd) / FADE_MS, done: false };
    }
    t -= end;
  }
  const line = lines[lines.length - 1];
  return { text: line, alpha: 0, done: true };
}
