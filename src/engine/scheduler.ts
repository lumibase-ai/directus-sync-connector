import type { Logger } from '../logger';
import type { SyncEngine } from './sync-engine';

/**
 * Drives an engine on a fixed interval with:
 *  - overlap guard (a slow cycle never runs concurrently with the next tick),
 *  - graceful shutdown on SIGINT/SIGTERM (finishes the in-flight cycle, then closes),
 *  - resilient errors (a failed cycle is logged; the loop continues next interval).
 */
export class Scheduler {
  private stopping = false;
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private done?: () => void;

  constructor(
    private readonly engine: SyncEngine,
    private readonly intervalMs: number,
    private readonly log: Logger,
  ) {}

  /** Start the loop and resolve only once a shutdown signal has been handled. */
  async start(): Promise<void> {
    this.installSignalHandlers();
    this.log.info(`scheduler: starting, interval ${this.intervalMs}ms`);

    const finished = new Promise<void>((resolveDone) => {
      this.done = resolveDone;
    });

    await this.tick(); // run immediately
    if (this.stopping) {
      this.finish();
      return finished;
    }

    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    return finished;
  }

  private async tick(): Promise<void> {
    if (this.stopping || this.inFlight) {
      if (this.inFlight) this.log.warn('scheduler: previous cycle still running; skipping tick');
      return;
    }
    this.inFlight = (async () => {
      try {
        await this.engine.runCycle();
      } catch (err) {
        this.log.error('scheduler: cycle failed; will retry next interval', err);
      }
    })();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = undefined;
      if (this.stopping) this.finish();
    }
  }

  private installSignalHandlers(): void {
    const onSignal = (sig: string) => {
      if (this.stopping) return;
      this.stopping = true;
      this.log.info(`scheduler: received ${sig}, shutting down after current cycle`);
      if (this.timer) clearInterval(this.timer);
      if (!this.inFlight) this.finish(); // idle → close now
    };
    process.once('SIGINT', () => onSignal('SIGINT'));
    process.once('SIGTERM', () => onSignal('SIGTERM'));
  }

  private finish(): void {
    if (this.timer) clearInterval(this.timer);
    this.done?.();
    this.done = undefined;
  }
}
