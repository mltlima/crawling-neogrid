import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export async function writeAtomicUtf8(
  filePath: string,
  content: string,
): Promise<void> {
  const directory = dirname(filePath);
  const temporary = join(
    directory,
    `.${basename(filePath)}.${randomUUID()}.tmp`,
  );
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
