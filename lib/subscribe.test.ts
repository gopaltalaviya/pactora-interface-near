import {afterEach, describe, expect, it, vi} from 'vitest';
import {subscribeToRun, type RunEvent} from './api';

/**
 * A stand-in EventSource. It records the URL and lets a test deliver named
 * events, which is exactly the surface `subscribeToRun` uses — and the one
 * that matters: an SSE event with no listener is silently dropped.
 */
class FakeEventSource {
  static CLOSED = 2;
  static last: FakeEventSource | null = null;
  static all: FakeEventSource[] = [];
  readyState = 1;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  private listeners = new Map<string, ((e: {data: string; lastEventId: string}) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
    FakeEventSource.all.push(this);
  }
  addEventListener(kind: string, fn: (e: {data: string; lastEventId: string}) => void) {
    this.listeners.set(kind, [...(this.listeners.get(kind) ?? []), fn]);
  }
  /** `id` as a v3 server sends it; a real MessageEvent has `lastEventId` '' when none was sent. */
  emit(kind: string, data: string, id = '') {
    for (const fn of this.listeners.get(kind) ?? []) fn({data, lastEventId: id});
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

afterEach(() => {
  FakeEventSource.last = null;
  FakeEventSource.all = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function subscribe() {
  vi.stubGlobal('EventSource', FakeEventSource);
  const events: RunEvent[] = [];
  const onClose = vi.fn();
  const onConnection = vi.fn();
  const onReplay = vi.fn();
  const stop = subscribeToRun(
    '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b',
    (e) => events.push(e),
    onClose,
    onConnection,
    onReplay,
  );
  return {events, onClose, onConnection, onReplay, stop, source: FakeEventSource.last!};
}

describe('subscribeToRun resuming (v3)', () => {
  /**
   * A v3 server gives every event an id, and a reconnecting EventSource gets
   * only what came after. Clearing the trace then — right for a server that
   * replays everything — would throw the history away.
   */
  it('keeps the trace on a browser reconnect when the server sends ids', () => {
    const {source, onReplay} = subscribe();
    source.onopen?.();
    source.emit('planned', JSON.stringify({kind: 'planned'}), '41');
    source.onopen?.(); // the browser reconnected the same source
    expect(onReplay).not.toHaveBeenCalled();
  });

  it('asks a new stream to resume after the last id it saw', () => {
    vi.useFakeTimers();
    const {source} = subscribe();
    source.emit('planned', JSON.stringify({kind: 'planned'}), '41');
    source.close(); // the browser gave up
    source.onerror?.();
    vi.advanceTimersByTime(3_000);
    expect(FakeEventSource.last!.url).toMatch(/\?lastEventId=41$/);
  });

  it('still starts over on a server without ids', () => {
    const {source, onReplay} = subscribe();
    source.onopen?.();
    source.emit('planned', JSON.stringify({kind: 'planned'}));
    source.onopen?.();
    expect(onReplay).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeToRun', () => {
  it('streams from the run’s events URL', () => {
    const {source} = subscribe();
    expect(source.url).toMatch(/\/v1\/runs\/3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b\/events$/);
  });

  it('delivers every kind the trace renders, including plan-failed', () => {
    const {source, events} = subscribe();
    for (const kind of ['planned', 'plan-failed', 'hired', 'settled', 'disputed', 'skipped'])
      source.emit(kind, JSON.stringify({kind}));
    expect(events.map((e) => e.kind)).toEqual([
      'planned',
      'plan-failed',
      'hired',
      'settled',
      'disputed',
      'skipped',
    ]);
  });

  it('survives a malformed frame and keeps streaming', () => {
    const {source, events} = subscribe();
    source.emit('planned', '{not json');
    source.emit('hired', JSON.stringify({jobId: 'x'}));
    expect(events.map((e) => e.kind)).toEqual(['hired']);
    expect(source.readyState).not.toBe(FakeEventSource.CLOSED);
  });

  it('closes on a terminal event and says so once', () => {
    const {source, onClose} = subscribe();
    source.emit('finished', JSON.stringify({spent: '0'}));
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('treats a transient error as retryable, and never treats a dropped stream as the end', () => {
    const {source, onClose, onConnection} = subscribe();
    source.onerror?.();
    expect(onClose).not.toHaveBeenCalled();
    expect(onConnection).toHaveBeenLastCalledWith('reconnecting');
    // Firefox gives up on a reset connection (CLOSED) where Chrome retries.
    // That used to read as "finished": an unfinished run looked done.
    source.readyState = FakeEventSource.CLOSED;
    source.onerror?.();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reconnects by itself when the browser gives up, and says when it is lost', () => {
    vi.useFakeTimers();
    const {source, onConnection} = subscribe();
    for (let i = 0; i < 3; i++) {
      FakeEventSource.last!.readyState = FakeEventSource.CLOSED;
      FakeEventSource.last!.onerror?.();
      vi.advanceTimersByTime(20_000);
    }
    expect(FakeEventSource.all.length).toBeGreaterThanOrEqual(3);
    expect(FakeEventSource.last).not.toBe(source);
    expect(onConnection).toHaveBeenCalledWith('lost');
    FakeEventSource.last!.onopen?.();
    expect(onConnection).toHaveBeenLastCalledWith('open');
  });

  it('a reconnect replays the history, so the page is told to start the trace over', () => {
    // The server sends every past event on each connection (no ids), so
    // without this every line appeared twice after a reconnect.
    const {source, onReplay, events} = subscribe();
    source.onopen?.();
    source.emit('planned', JSON.stringify({subtasks: 1}));
    expect(onReplay).not.toHaveBeenCalled(); // the first connection is not a replay
    source.onerror?.();
    source.onopen?.(); // the browser reconnected
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.kind)).toEqual(['planned']);
  });

  it('stops reconnecting once unsubscribed', () => {
    vi.useFakeTimers();
    const {source, stop} = subscribe();
    source.readyState = FakeEventSource.CLOSED;
    source.onerror?.();
    stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeEventSource.all).toHaveLength(1);
  });

  it('unsubscribes by closing the stream', () => {
    const {source, stop} = subscribe();
    stop();
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
  });
});
