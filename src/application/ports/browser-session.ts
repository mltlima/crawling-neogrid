import type { PageProbe, ValidInputRecord } from '../../domain/index.js';

export interface BrowserProbeOptions {
  readonly input: ValidInputRecord;
  readonly headless: boolean;
  readonly timeoutMs: number;
  readonly trace: boolean;
  readonly maxJsonBytes: number;
}

export interface BrowserSession {
  probe(options: BrowserProbeOptions): Promise<PageProbe>;
}
