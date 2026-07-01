import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const EVENTS_PATH = require.resolve('../src/events.js');
function freshEvents() {
  delete require.cache[EVENTS_PATH];
  return require('../src/events.js');
}

describe('emitThrottled (BLR Phase 4 -- burst coalescing)', () => {
  let events;

  beforeEach(() => {
    vi.useFakeTimers();
    events = freshEvents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits immediately on the first call (leading edge)', () => {
    const result = events.emitThrottled('QUEUE_ITEM_ADDED', { level: 'info', module: 'Queue', message: 'Item added' }, 1000);
    expect(result).not.toBeNull();
    expect(result.type).toBe('QUEUE_ITEM_ADDED');
    const recent = events.getRecentEvents(10).filter((e) => e.type === 'QUEUE_ITEM_ADDED');
    expect(recent.length).toBe(1);
  });

  it('does not emit a trailing rollup when only one call occurs in the window', () => {
    events.emitThrottled('QUEUE_ITEM_ADDED', { module: 'Queue', message: 'Item added' }, 1000);
    vi.advanceTimersByTime(1000);
    const recent = events.getRecentEvents(10).filter((e) => e.type === 'QUEUE_ITEM_ADDED');
    expect(recent.length).toBe(1);
  });

  it('coalesces a burst into exactly one leading + one trailing rollup event', () => {
    for (let i = 0; i < 5; i++) {
      events.emitThrottled('QUEUE_ITEM_ADDED', { module: 'Queue', message: 'Item added', data: { n: i } }, 1000);
    }
    let recent = events.getRecentEvents(10).filter((e) => e.type === 'QUEUE_ITEM_ADDED');
    expect(recent.length).toBe(1);
    vi.advanceTimersByTime(1000);
    recent = events.getRecentEvents(10).filter((e) => e.type === 'QUEUE_ITEM_ADDED');
    expect(recent.length).toBe(2);
    const rollup = recent[1];
    expect(rollup.data.coalesced).toBe(true);
    expect(rollup.data.count).toBe(5);
  });

  it('tracks separate types independently', () => {
    events.emitThrottled('QUEUE_ITEM_ADDED', { module: 'Queue', message: 'Item added' }, 1000);
    events.emitThrottled('QUEUE_OVERFLOW', { module: 'Queue', message: 'Overflow' }, 1000);
    const added = events.getRecentEvents(10).filter((e) => e.type === 'QUEUE_ITEM_ADDED');
    const overflow = events.getRecentEvents(10).filter((e) => e.type === 'QUEUE_OVERFLOW');
    expect(added.length).toBe(1);
    expect(overflow.length).toBe(1);
  });

  it('starts a fresh leading edge after the window closes', () => {
    events.emitThrottled('QUEUE_ITEM_ADDED', { module: 'Queue', message: 'Item added' }, 1000);
    vi.advanceTimersByTime(1000);
    const second = events.emitThrottled('QUEUE_ITEM_ADDED', { module: 'Queue', message: 'Item added' }, 1000);
    expect(second).not.toBeNull();
    const recent = events.getRecentEvents(10).filter((e) => e.type === 'QUEUE_ITEM_ADDED');
    expect(recent.length).toBe(2);
  });
});
