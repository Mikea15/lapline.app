// A stand-in for fit-parser.worker.ts that parses on the calling thread,
// for tests that run the real import under Node (which has no Worker).
// Use it through the pool:
//   vi.mock('../fit-parse-pool', async (importOriginal) => {
//     const actual = await importOriginal<typeof import('../fit-parse-pool')>();
//     const { createInProcessWorker } = await import('./in-process-worker');
//     return { ...actual, createFitParsePool: (n: number) => actual.createFitParsePool(n, { createWorker: createInProcessWorker }) };
//   });
import { parseWorkout } from '../parse-workout';
import type { WorkoutFormat } from '../fit-parse-pool';

class InProcessWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;

  postMessage(msg: { id: number; format: WorkoutFormat; bytes: Uint8Array }): void {
    parseWorkout(msg.format, msg.bytes).then(
      (activities) => this.onmessage?.({ data: { id: msg.id, activities } } as MessageEvent),
      (e: unknown) => this.onmessage?.({ data: { id: msg.id, error: e instanceof Error ? e.message : String(e) } } as MessageEvent)
    );
  }

  terminate(): void {}
}

export function createInProcessWorker(): Worker {
  return new InProcessWorker() as unknown as Worker;
}
