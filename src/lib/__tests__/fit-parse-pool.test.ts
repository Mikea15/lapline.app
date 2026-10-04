import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFitParsePool, FIT_PARSE_TIMEOUT_MS, type ParseJob, type WorkoutFormat } from '../fit-parse-pool';
import type { ParsedActivity } from '../types';

interface Posted {
  id: number;
  format: WorkoutFormat;
  bytes: Uint8Array;
}

// Stands in for fit-parser.worker.ts: records what it's sent and lets each
// test decide when and how it answers.
class StubWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  posted: Posted[] = [];
  terminated = false;

  postMessage(msg: Posted): void {
    this.posted.push(msg);
  }
  terminate(): void {
    this.terminated = true;
  }
  get lastId(): number {
    return this.posted[this.posted.length - 1]!.id;
  }
  reply(data: { activities?: ParsedActivity[]; error?: string }): void {
    this.onmessage?.({ data: { id: this.lastId, ...data } } as MessageEvent);
  }
  crash(message = 'Out of memory'): void {
    this.onerror?.({ message, preventDefault() {} } as ErrorEvent);
  }
  garble(): void {
    this.onmessageerror?.({} as MessageEvent);
  }
}

const ACTIVITY = { sport: 'running' } as unknown as ParsedActivity;
const job = (format: WorkoutFormat = 'fit'): ParseJob => ({ format, read: async () => new Uint8Array([1, 2, 3]) });

function pool(fileCount: number) {
  const created: StubWorker[] = [];
  const p = createFitParsePool(fileCount, {
    createWorker: () => {
      const w = new StubWorker();
      created.push(w);
      return w as unknown as Worker;
    }
  });
  return { p, created };
}

// Lets awaited acquire()/postMessage chains run.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('createFitParsePool', () => {
  it('resolves with the parsed activities and rejects with the parser error', async () => {
    const { p, created } = pool(1);
    const ok = p.parse(job());
    await flush();
    created[0]!.reply({ activities: [ACTIVITY] });
    await expect(ok).resolves.toEqual([ACTIVITY]);

    const bad = p.parse(job());
    await flush();
    created[0]!.reply({ error: 'no workout data found' });
    await expect(bad).rejects.toThrow('no workout data found');
    expect(created).toHaveLength(1); // a parse error doesn't cost the worker
  });

  it('fails the file and replaces the worker when it crashes', async () => {
    const { p, created } = pool(1);
    const first = p.parse(job());
    const second = p.parse(job()); // queued behind the only worker
    await flush();
    created[0]!.crash();
    await expect(first).rejects.toThrow(/stopped unexpectedly/);
    expect(created[0]!.terminated).toBe(true);

    await flush();
    expect(created).toHaveLength(2);
    created[1]!.reply({ activities: [ACTIVITY] });
    await expect(second).resolves.toEqual([ACTIVITY]);
  });

  it('fails the file and replaces the worker on an unreadable reply', async () => {
    const { p, created } = pool(1);
    const first = p.parse(job());
    const second = p.parse(job());
    await flush();
    created[0]!.garble();
    await expect(first).rejects.toThrow(/reply couldn't be read/);
    expect(created[0]!.terminated).toBe(true);

    await flush();
    created[1]!.reply({ activities: [ACTIVITY] });
    await expect(second).resolves.toEqual([ACTIVITY]);
  });

  it('times out a stuck file, kills its worker and carries on with the next', async () => {
    vi.useFakeTimers();
    const { p, created } = pool(1);
    const started: number[] = [];
    const first = p.parse(job(), () => started.push(1));
    const second = p.parse(job(), () => started.push(2));
    const firstResult = first.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([1]);

    await vi.advanceTimersByTimeAsync(FIT_PARSE_TIMEOUT_MS - 1);
    expect(created[0]!.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await firstResult).toBeInstanceOf(Error);
    expect(((await firstResult) as Error).message).toMatch(/took longer than 60 s/);
    expect(created[0]!.terminated).toBe(true);

    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([1, 2]);
    created[1]!.reply({ activities: [ACTIVITY] });
    await expect(second).resolves.toEqual([ACTIVITY]);
  });

  it('does not time out a file that finished in time', async () => {
    vi.useFakeTimers();
    const { p, created } = pool(1);
    const done = p.parse(job());
    await vi.advanceTimersByTimeAsync(0);
    created[0]!.reply({ activities: [ACTIVITY] });
    await expect(done).resolves.toEqual([ACTIVITY]);
    await vi.advanceTimersByTimeAsync(FIT_PARSE_TIMEOUT_MS * 2);
    expect(created[0]!.terminated).toBe(false);
  });

  it('only crashes the file on the broken worker, not the ones running beside it', async () => {
    const { p, created } = pool(2);
    const a = p.parse(job());
    const b = p.parse(job());
    await flush();
    expect(created).toHaveLength(2);
    created[0]!.crash();
    created[1]!.reply({ activities: [ACTIVITY] });
    await expect(a).rejects.toThrow();
    await expect(b).resolves.toEqual([ACTIVITY]);
  });

  it('fails every file, without respawning in a loop, when the worker script never loads', async () => {
    const { p, created } = pool(1);
    const results = [p.parse(job()), p.parse(job()), p.parse(job())].map((r) => r.catch((e: Error) => e));
    for (let i = 0; i < 3; i++) {
      await flush();
      created[i]!.crash('');
    }
    for (const r of await Promise.all(results)) expect(r).toBeInstanceOf(Error);
    expect(created).toHaveLength(3); // one per file, none spare
  });

  it('ignores a second failure event from an already-retired worker', async () => {
    const { p, created } = pool(1);
    const first = p.parse(job());
    await flush();
    created[0]!.crash();
    created[0]!.garble();
    await expect(first).rejects.toThrow(/stopped unexpectedly/);
    expect(created).toHaveLength(1);
  });

  it('reads a file only once a worker is free to parse it', async () => {
    const { p, created } = pool(1);
    const reads: string[] = [];
    const tracked = (name: string): ParseJob => ({ format: 'fit', read: async () => (reads.push(name), new Uint8Array([1])) });
    const first = p.parse(tracked('a'));
    const second = p.parse(tracked('b'));
    await flush();
    expect(reads).toEqual(['a']);

    created[0]!.reply({ activities: [ACTIVITY] });
    await first;
    await flush();
    expect(reads).toEqual(['a', 'b']);
    created[0]!.reply({ activities: [] });
    await second;
  });

  it('sends the format with the bytes', async () => {
    const { p, created } = pool(1);
    const done = p.parse(job('gpx'));
    await flush();
    expect(created[0]!.posted[0]).toMatchObject({ format: 'gpx', bytes: new Uint8Array([1, 2, 3]) });
    created[0]!.reply({ activities: [ACTIVITY] });
    await done;
  });

  it('fails only the file whose read failed and keeps the worker', async () => {
    const { p, created } = pool(1);
    const bad = p.parse({ format: 'fit', read: () => Promise.reject(new Error('file too large')) });
    const good = p.parse(job());
    await expect(bad).rejects.toThrow('file too large');
    await flush();
    created[0]!.reply({ activities: [ACTIVITY] });
    await expect(good).resolves.toEqual([ACTIVITY]);
    expect(created).toHaveLength(1);
  });

  it('caps its size at the file count and six workers', () => {
    expect(pool(1).p.size).toBe(1);
    expect(pool(100).p.size).toBeLessThanOrEqual(6);
  });

  it('terminate() stops the workers and fails anything still queued', async () => {
    const { p, created } = pool(1);
    const running = p.parse(job());
    const queued = p.parse(job());
    await flush();
    p.terminate();
    await expect(running).rejects.toThrow(/stopped/);
    await expect(queued).rejects.toThrow(/stopped/);
    expect(created.every((w) => w.terminated)).toBe(true);
  });
});
