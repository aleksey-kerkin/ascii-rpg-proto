import { describe, expect, it } from 'vitest';
import { captionFrame } from './caption';

describe('captionFrame', () => {
  it('shows the first character immediately, then the rest every 45 ms', () => {
    expect(captionFrame(['-4'], 0)).toEqual({ text: '-', alpha: 1, done: false });
    expect(captionFrame(['-4'], 45)).toEqual({ text: '-4', alpha: 1, done: false });
    expect(captionFrame(['miss'], 0).text).toBe('m');
  });

  it('holds, fades, and then types the next line', () => {
    expect(captionFrame(['a'], 0)).toEqual({ text: 'a', alpha: 1, done: false });
    expect(captionFrame(['a'], 349).alpha).toBe(1);
    expect(captionFrame(['a'], 475).alpha).toBeCloseTo(0.5);
    expect(captionFrame(['a'], 600)).toEqual({ text: 'a', alpha: 0, done: true });
    expect(captionFrame(['c', 'online'], 0).text).toBe('c');
    expect(captionFrame(['c', 'online'], 600).text).toBe('o');
    expect(captionFrame(['c', 'online'], 600 + 5 * 45).text).toBe('online');
  });
});
