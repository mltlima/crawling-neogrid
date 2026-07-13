import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FilesystemCheckpointStore } from '../../src/infrastructure/persistence/index.js';
import type { RunManifest } from '../../src/domain/index.js';

const dirs: string[] = [];
function manifest(): RunManifest {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    schemaVersion: 1,
    runId: 'run',
    status: 'CREATED',
    createdAt: now,
    updatedAt: now,
    input: { fileName: 'input.txt', format: 'txt', sha256: 'a'.repeat(64) },
    totalRecords: 1,
    validRecords: 1,
    selectedRecords: 1,
    limit: null,
    selectedInputs: [
      {
        originalIndex: 0,
        merchantId: '11111111-1111-4111-8111-111111111111',
        itemId: '22222222-2222-4222-8222-222222222222',
      },
    ],
    effectiveConfig: {},
    appVersion: null,
    completedRecords: 0,
    pendingRecords: 1,
    skippedRecords: 0,
    files: {
      resultsJournal: 'results.journal.jsonl',
      eventsJournal: 'events.journal.jsonl',
    },
  };
}
describe('FilesystemCheckpointStore', () => {
  it('creates an exclusive lock and recovers an incomplete final journal line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'checkpoint-'));
    dirs.push(dir);
    const store = new FilesystemCheckpointStore(dir);
    await store.create(manifest());
    await store.acquireLock('run');
    await expect(store.acquireLock('run')).rejects.toMatchObject({
      code: 'CHECKPOINT_LOCKED',
    });
    await store.releaseLock();
    await writeFile(join(dir, 'results.journal.jsonl'), '{', { flag: 'a' });
    const replay = await store.replay();
    expect(replay.results).toEqual([]);
    expect(replay.repairedTrailingLine).toBe(true);
    expect(await readFile(join(dir, 'results.journal.jsonl'), 'utf8')).toBe('');
  });

  it('refuses force unlock while the owning process is active', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'checkpoint-'));
    dirs.push(dir);
    const store = new FilesystemCheckpointStore(dir);
    await store.create(manifest());
    await writeFile(
      store.lockPath,
      JSON.stringify({ pid: process.pid, runId: 'run' }),
    );
    await expect(store.acquireLock('run', true)).rejects.toMatchObject({
      code: 'CHECKPOINT_LOCKED',
    });
  });
});
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
