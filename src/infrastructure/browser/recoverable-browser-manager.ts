import type {
  BrowserSessionFactory,
  ManagedBrowserSession,
} from '../../application/index.js';

export interface BrowserLease {
  readonly session: ManagedBrowserSession;
  readonly generation: number;
}

export class RecoverableBrowserManager {
  private current: BrowserLease | null = null;
  private recovery: Promise<void> | null = null;
  private closed = false;
  private restarts = 0;

  public constructor(
    private readonly factory: BrowserSessionFactory,
    private readonly headless: boolean,
  ) {}

  public get browserRestarts(): number {
    return this.restarts;
  }

  public async start(): Promise<void> {
    if (this.current !== null) {
      return;
    }
    this.current = {
      session: await this.factory.open(this.headless),
      generation: 0,
    };
  }

  public async acquire(): Promise<BrowserLease> {
    await this.recovery;
    if (this.closed || this.current === null) {
      throw new Error('Browser manager unavailable.');
    }
    return this.current;
  }

  public async invalidate(generation: number): Promise<void> {
    if (this.closed || generation !== this.current?.generation) {
      return;
    }
    this.recovery ??= this.restart(generation).finally(() => {
      this.recovery = null;
    });
    await this.recovery;
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.recovery?.catch(() => undefined);
    const session = this.current?.session;
    this.current = null;
    await session?.close();
  }

  private async restart(generation: number): Promise<void> {
    const old = this.current;
    if (old?.generation !== generation) {
      return;
    }
    const next = await this.factory.open(this.headless);
    this.current = { session: next, generation: generation + 1 };
    this.restarts += 1;
    await old.session.close();
  }
}
