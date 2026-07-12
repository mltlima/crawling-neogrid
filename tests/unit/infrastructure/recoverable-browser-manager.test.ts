import { describe, expect, it, vi } from 'vitest';

import type {
  BrowserSessionFactory,
  ManagedBrowserSession,
} from '../../../src/application/index.js';
import { RecoverableBrowserManager } from '../../../src/infrastructure/browser/index.js';

function session(): ManagedBrowserSession {
  return {
    probe: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
    isConnected: () => true,
  };
}

describe('RecoverableBrowserManager', () => {
  it('coalesces concurrent invalidations and ignores stale generations', async () => {
    const first = session();
    const second = session();
    const open = vi
      .fn<BrowserSessionFactory['open']>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const manager = new RecoverableBrowserManager({ open }, true);
    await manager.start();
    await Promise.all([manager.invalidate(0), manager.invalidate(0)]);
    expect(open).toHaveBeenCalledTimes(2);
    expect(manager.browserRestarts).toBe(1);
    expect((await manager.acquire()).generation).toBe(1);
    await manager.invalidate(0);
    expect(open).toHaveBeenCalledTimes(2);
    await manager.close();
    await manager.close();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(first.close).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(second.close).toHaveBeenCalledOnce();
  });
});
