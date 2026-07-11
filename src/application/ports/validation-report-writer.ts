import type { InputValidationResult } from '../../domain/index.js';

export interface ValidationReportWriter {
  write(filePath: string, report: InputValidationResult): Promise<void>;
}
