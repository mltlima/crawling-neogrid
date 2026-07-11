import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  InputOperationalError,
  type ProbeArtifactsOptions,
  type ProbeArtifactsWriter,
} from '../../application/index.js';
import { sanitizeDiagnosticMessages } from './diagnostic-sanitizer.js';

export class PlaywrightArtifactsWriter implements ProbeArtifactsWriter {
  public async write(options: ProbeArtifactsOptions): Promise<void> {
    try {
      await mkdir(options.directory, { recursive: true });
      const json = (value: unknown): string =>
        `${JSON.stringify(value, null, 2)}\n`;
      await Promise.all([
        writeFile(
          join(options.directory, 'probe-result.json'),
          json(options.result),
        ),
        writeFile(
          join(options.directory, 'responses-summary.json'),
          json(options.page.responses.map((response) => response.summary)),
        ),
        writeFile(
          join(options.directory, 'console-errors.json'),
          json(sanitizeDiagnosticMessages(options.page.consoleErrors)),
        ),
        writeFile(
          join(options.directory, 'page-errors.json'),
          json(sanitizeDiagnosticMessages(options.page.pageErrors)),
        ),
      ]);
      if (
        options.result.product.status === 'error' ||
        options.screenshotOnSuccess
      ) {
        await writeFile(
          join(options.directory, 'screenshot.png'),
          options.page.screenshot,
        );
      }
      if (options.page.trace !== null) {
        await writeFile(
          join(options.directory, 'trace.zip'),
          options.page.trace,
        );
      }
    } catch (error: unknown) {
      throw new InputOperationalError(
        'ARTIFACT_WRITE_FAILED',
        `Não foi possível salvar evidências em ${options.directory}.`,
        { cause: error },
      );
    }
  }
}
