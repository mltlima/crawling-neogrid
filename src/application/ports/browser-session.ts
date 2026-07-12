import type { PageProbe, ValidInputRecord } from '../../domain/index.js';

export interface ManagedBrowserProbeOptions {
  readonly timeoutMs: number;
  readonly settleTimeoutMs: number;
  readonly trace: boolean;
  readonly captureScreenshot: boolean;
  readonly maxJsonBytes: number;
  readonly maxRetryAfterMs?: number;
}

export interface ManagedBrowserSession {
  probe(
    input: ValidInputRecord,
    options: ManagedBrowserProbeOptions,
  ): Promise<PageProbe>;
  close(): Promise<void>;
  isConnected?(): boolean;
}

export interface BrowserSessionFactory {
  open(headless: boolean): Promise<ManagedBrowserSession>;
}
