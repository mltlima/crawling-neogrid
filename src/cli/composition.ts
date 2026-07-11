import {
  CsvInputReader,
  JsonInputReader,
  NodeInputFileInspector,
  TxtInputReader,
  XlsxInputReader,
} from '../adapters/input/index.js';
import { ValidateInputUseCase } from '../application/index.js';
import type { InputValidationResult } from '../domain/index.js';

const validateInputUseCase = new ValidateInputUseCase(
  [
    new XlsxInputReader(),
    new CsvInputReader(),
    new TxtInputReader(),
    new JsonInputReader(),
  ],
  new NodeInputFileInspector(),
);

export async function validateInputFile(
  filePath: string,
): Promise<InputValidationResult> {
  return validateInputUseCase.execute(filePath);
}
