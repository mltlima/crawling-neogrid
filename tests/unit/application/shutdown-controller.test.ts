import { describe, expect, it } from 'vitest';

import { ShutdownController } from '../../../src/application/index.js';

describe('ShutdownController', () => {
  it('requests a graceful stop first and immediate termination second', () => {
    const controller = new ShutdownController();
    expect(controller.shouldStop).toBe(false);
    expect(controller.shouldTerminateImmediately).toBe(false);
    controller.request();
    expect(controller.shouldStop).toBe(true);
    expect(controller.shouldTerminateImmediately).toBe(false);
    controller.request();
    expect(controller.shouldTerminateImmediately).toBe(true);
  });
});
