import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';

import {
  InputOperationalError,
  type InputFileInspector,
} from '../../application/index.js';

export class NodeInputFileInspector implements InputFileInspector {
  public async assertReadableFile(filePath: string): Promise<void> {
    let fileStats;
    try {
      fileStats = await stat(filePath);
    } catch (error: unknown) {
      throw new InputOperationalError(
        'FILE_NOT_FOUND',
        `Arquivo de entrada não encontrado: ${filePath}.`,
        { cause: error },
      );
    }

    if (!fileStats.isFile()) {
      throw new InputOperationalError(
        'FILE_UNREADABLE',
        `O caminho de entrada não aponta para um arquivo: ${filePath}.`,
      );
    }

    if (fileStats.size === 0) {
      throw new InputOperationalError(
        'FILE_EMPTY',
        `O arquivo de entrada está vazio: ${filePath}.`,
      );
    }

    try {
      await access(filePath, constants.R_OK);
    } catch (error: unknown) {
      throw new InputOperationalError(
        'FILE_UNREADABLE',
        `O arquivo de entrada não pode ser lido: ${filePath}.`,
        { cause: error },
      );
    }
  }
}
