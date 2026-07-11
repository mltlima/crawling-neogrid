import { readFile } from 'node:fs/promises';

import { InputOperationalError } from '../../application/index.js';

export async function readUtf8File(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, 'utf8');
    return content.replace(/^\uFEFF/, '');
  } catch (error: unknown) {
    throw new InputOperationalError(
      'FILE_UNREADABLE',
      `Não foi possível ler o arquivo: ${filePath}.`,
      { cause: error },
    );
  }
}

export function assertRecordsExist(count: number, filePath: string): void {
  if (count === 0) {
    throw new InputOperationalError(
      'FILE_EMPTY',
      `O arquivo não contém registros de entrada: ${filePath}.`,
    );
  }
}
