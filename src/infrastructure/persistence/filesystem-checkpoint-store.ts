import { createHash, randomUUID } from 'node:crypto';
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, join } from 'node:path';

import { InputOperationalError } from '../../application/index.js';
import {
  checkpointEventSchema,
  checkpointResultSchema,
  runManifestSchema,
  type CheckpointEvent,
  type CheckpointResult,
  type RunManifest,
} from '../../domain/index.js';
import { writeAtomicUtf8 } from './atomic-file.js';

export interface CheckpointReplay {
  readonly manifest: RunManifest;
  readonly results: readonly CheckpointResult[];
  readonly repairedTrailingLine: boolean;
}

export class FilesystemCheckpointStore {
  private appendTail: Promise<void> = Promise.resolve();
  public constructor(
    private readonly directory: string,
    private readonly syncEvery = 1,
  ) {}
  public get manifestPath(): string {
    return join(this.directory, 'manifest.json');
  }
  public get resultsPath(): string {
    return join(this.directory, 'results.journal.jsonl');
  }
  public get eventsPath(): string {
    return join(this.directory, 'events.journal.jsonl');
  }
  public get lockPath(): string {
    return join(this.directory, 'run.lock');
  }

  public async create(manifest: RunManifest): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeAtomicUtf8(
      this.manifestPath,
      `${JSON.stringify(runManifestSchema.parse(manifest), null, 2)}\n`,
    );
    await writeFile(this.resultsPath, '', { flag: 'wx' });
    await writeFile(this.eventsPath, '', { flag: 'wx' });
  }

  public async readManifest(): Promise<RunManifest> {
    try {
      return runManifestSchema.parse(
        JSON.parse(await readFile(this.manifestPath, 'utf8')),
      );
    } catch (error: unknown) {
      throw new InputOperationalError(
        'CHECKPOINT_FAILED',
        'Manifesto de checkpoint inválido.',
        { cause: error },
      );
    }
  }

  public async writeManifest(manifest: RunManifest): Promise<void> {
    try {
      await writeAtomicUtf8(
        this.manifestPath,
        `${JSON.stringify(runManifestSchema.parse(manifest), null, 2)}\n`,
      );
    } catch (error: unknown) {
      throw new InputOperationalError(
        'CHECKPOINT_FAILED',
        'Não foi possível atualizar o manifesto.',
        { cause: error },
      );
    }
  }

  public async appendResult(entry: CheckpointResult): Promise<void> {
    const task = this.appendTail.then(async () => {
      const line = `${JSON.stringify(checkpointResultSchema.parse(entry))}\n`;
      const handle = await open(this.resultsPath, 'a');
      try {
        await handle.writeFile(line, 'utf8');
        if (this.syncEvery === 1) {
          await handle.sync();
        }
      } finally {
        await handle.close();
      }
    });
    this.appendTail = task.catch(() => undefined);
    await task;
  }

  public async appendEvent(event: CheckpointEvent): Promise<void> {
    await appendFile(
      this.eventsPath,
      `${JSON.stringify(checkpointEventSchema.parse(event))}\n`,
      'utf8',
    );
  }

  public async replay(): Promise<CheckpointReplay> {
    const manifest = await this.readManifest();
    const raw = await readFile(this.resultsPath, 'utf8');
    const lines = raw.split('\n');
    const trailing = lines.pop() ?? '';
    const repairedTrailingLine = trailing.length > 0;
    const completed = new Map<number, CheckpointResult>();
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      let entry: CheckpointResult;
      try {
        entry = checkpointResultSchema.parse(JSON.parse(line));
      } catch (error: unknown) {
        throw new InputOperationalError(
          'CHECKPOINT_FAILED',
          'Journal de resultados corrompido.',
          { cause: error },
        );
      }
      const previous = completed.get(entry.originalIndex);
      if (
        previous !== undefined &&
        JSON.stringify(previous) !== JSON.stringify(entry)
      ) {
        throw new InputOperationalError(
          'CHECKPOINT_FAILED',
          'Resultados conflitantes no journal.',
        );
      }
      completed.set(entry.originalIndex, entry);
    }
    return {
      manifest,
      results: [...completed.values()].sort(
        (a, b) => a.originalIndex - b.originalIndex,
      ),
      repairedTrailingLine,
    };
  }

  public async acquireLock(runId: string, forceUnlock = false): Promise<void> {
    if (forceUnlock) {
      await rm(this.lockPath, { force: true });
    }
    try {
      await writeFile(
        this.lockPath,
        JSON.stringify({
          runId,
          pid: process.pid,
          createdAt: new Date().toISOString(),
          nonce: randomUUID(),
        }),
        { flag: 'wx' },
      );
    } catch (error: unknown) {
      throw new InputOperationalError(
        'CHECKPOINT_LOCKED',
        'Checkpoint já possui lock ativo ou residual.',
        { cause: error },
      );
    }
  }
  public async releaseLock(): Promise<void> {
    await rm(this.lockPath, { force: true });
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}
export function safeFileName(filePath: string): string {
  return basename(filePath);
}
