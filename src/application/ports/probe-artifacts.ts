import type { PageProbe, ProbeResult } from '../../domain/index.js';

export interface ProbeArtifactsOptions {
  readonly directory: string;
  readonly result: ProbeResult;
  readonly page: PageProbe;
  readonly screenshotOnSuccess: boolean;
}

export interface ProbeArtifactsWriter {
  write(options: ProbeArtifactsOptions): Promise<void>;
}
