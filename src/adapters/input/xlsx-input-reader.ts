import ExcelJS from 'exceljs';

import { InputOperationalError, type InputReader } from '../../application/index.js';
import { inputBatchSchema, type InputBatch } from '../../domain/index.js';
import { assertRecordsExist } from './shared.js';

export class XlsxInputReader implements InputReader {
  public readonly format = 'xlsx' as const;
  public readonly extension = '.xlsx' as const;

  public async read(filePath: string): Promise<InputBatch> {
    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.readFile(filePath);
    } catch (error: unknown) {
      throw new InputOperationalError(
        'FILE_UNREADABLE',
        `Não foi possível interpretar o XLSX: ${filePath}.`,
        { cause: error },
      );
    }

    const worksheet = workbook.worksheets[0];
    if (worksheet === undefined || worksheet.rowCount === 0) {
      throw new InputOperationalError(
        'FILE_EMPTY',
        `O arquivo XLSX está vazio: ${filePath}.`,
      );
    }

    const headerRow = worksheet.getRow(1);
    let urlColumnNumber: number | undefined;
    headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      if (cell.text.trim().toLowerCase() === 'url') {
        urlColumnNumber = columnNumber;
      }
    });

    if (urlColumnNumber === undefined) {
      throw new InputOperationalError(
        'MISSING_URL_COLUMN',
        'O arquivo XLSX deve possuir uma coluna url.',
      );
    }

    const records = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const cell = worksheet.getRow(rowNumber).getCell(urlColumnNumber);
      const hyperlink: unknown = cell.hyperlink;
      records.push({
        originalIndex: rowNumber - 2,
        lineNumber: rowNumber,
        value:
          typeof hyperlink === 'string' && hyperlink.length > 0
            ? hyperlink
            : cell.text,
      });
    }
    assertRecordsExist(records.length, filePath);

    return inputBatchSchema.parse({
      sourcePath: filePath,
      format: this.format,
      records,
    });
  }
}
