import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createLogger } from '../../../src/observability/logger.js';

const logEntrySchema = z.object({
  level: z.number(),
  msg: z.string(),
  runId: z.string().optional(),
  service: z.string(),
  token: z.string().optional(),
});

function captureLogs(): {
  readonly lines: string[];
  readonly stream: { write(message: string): void };
} {
  const lines: string[] = [];

  return {
    lines,
    stream: {
      write(message: string): void {
        lines.push(message);
      },
    },
  };
}

describe('createLogger', () => {
  it('emits structured JSON with operational context', () => {
    const capture = captureLogs();
    const logger = createLogger(
      { level: 'info', serviceName: 'crawler-test' },
      capture.stream,
    );

    logger.info({ runId: 'run-123' }, 'batch started');

    const payload: unknown = JSON.parse(capture.lines[0] ?? '');
    const entry = logEntrySchema.parse(payload);
    expect(entry).toMatchObject({
      level: 30,
      msg: 'batch started',
      runId: 'run-123',
      service: 'crawler-test',
    });
  });

  it('redacts common sensitive fields', () => {
    const capture = captureLogs();
    const logger = createLogger({ level: 'info' }, capture.stream);

    logger.info({ token: 'do-not-log' }, 'redaction test');

    const payload: unknown = JSON.parse(capture.lines[0] ?? '');
    const entry = logEntrySchema.parse(payload);
    expect(entry.service).toBe('ifood-crawler');
    expect(entry.token).toBe('[Redacted]');
  });
});
