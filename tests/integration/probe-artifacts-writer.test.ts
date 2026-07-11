import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PlaywrightArtifactsWriter } from '../../src/infrastructure/browser/index.js';
import type { PageProbe, ProbeResult } from '../../src/domain/index.js';
import { makeIfoodUrl } from '../fixtures/input-values.js';

describe('PlaywrightArtifactsWriter', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ifood-artifacts-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes sanitized summaries, failure screenshot and optional trace', async () => {
    const page: PageProbe = {
      finalUrl: makeIfoodUrl(),
      httpStatus: 403,
      html: '<secret>',
      responses: [
        {
          summary: {
            url: 'https://example.test/api',
            method: 'GET',
            status: 200,
            contentType: 'application/json',
            durationMs: 1,
            approximateSizeBytes: 10,
            possibleProductData: true,
            payloadTruncated: false,
          },
          jsonPayload: { secret: 'must-not-be-written' },
        },
      ],
      consoleErrors: ['GET https://example.test/api?token=secret token=secret'],
      pageErrors: ['authorization=hidden'],
      dom: {
        title: null,
        normalPrice: null,
        discountPrice: null,
        imageUrl: null,
        bodyText: '',
      },
      timedOut: false,
      screenshot: new Uint8Array([1, 2]),
      trace: new Uint8Array([3, 4]),
    };
    const result: ProbeResult = {
      runId: 'run',
      source: 'none',
      pageState: 'ACCESS_BLOCKED',
      product: {
        title: null,
        normal_price: null,
        discount_price: null,
        product_url: makeIfoodUrl(),
        image_url: null,
        status: 'error',
        error_message: 'Bloqueado.',
      },
      artifactsDirectory: directory,
      durationMs: 1,
    };
    await new PlaywrightArtifactsWriter().write({
      directory,
      result,
      page,
      screenshotOnSuccess: false,
    });
    const responses = await readFile(
      join(directory, 'responses-summary.json'),
      'utf8',
    );
    expect(responses).not.toContain('must-not-be-written');
    const persistedDiagnostics = `${await readFile(
      join(directory, 'console-errors.json'),
      'utf8',
    )}${await readFile(join(directory, 'page-errors.json'), 'utf8')}`;
    expect(persistedDiagnostics).not.toContain('secret');
    expect(persistedDiagnostics).not.toContain('hidden');
    expect(persistedDiagnostics).not.toContain('?token=');
    await expect(
      access(join(directory, 'screenshot.png')),
    ).resolves.toBeUndefined();
    await expect(access(join(directory, 'trace.zip'))).resolves.toBeUndefined();
    await expect(
      access(join(directory, 'probe-result.json')),
    ).resolves.toBeUndefined();
  });

  it('omits screenshot and trace for success by default', async () => {
    const target = join(directory, 'success');
    const page: PageProbe = {
      finalUrl: makeIfoodUrl(),
      httpStatus: 200,
      html: '',
      responses: [],
      consoleErrors: [],
      pageErrors: [],
      dom: {
        title: 'Produto',
        normalPrice: 'R$ 1,00',
        discountPrice: null,
        imageUrl: null,
        bodyText: '',
      },
      timedOut: false,
      screenshot: new Uint8Array([1]),
      trace: null,
    };
    const result: ProbeResult = {
      runId: 'success',
      source: 'dom',
      pageState: 'PRODUCT_FOUND',
      product: {
        title: 'Produto',
        normal_price: 100,
        discount_price: null,
        product_url: makeIfoodUrl(),
        image_url: null,
        status: 'success',
        error_message: null,
      },
      artifactsDirectory: target,
      durationMs: 1,
    };
    await new PlaywrightArtifactsWriter().write({
      directory: target,
      result,
      page,
      screenshotOnSuccess: false,
    });
    await expect(access(join(target, 'screenshot.png'))).rejects.toThrow();
    await expect(access(join(target, 'trace.zip'))).rejects.toThrow();
  });
});
