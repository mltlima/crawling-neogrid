export { InputOperationalError } from './errors/input-operational-error.js';
export type { InputFileInspector, InputReader } from './ports/input-reader.js';
export type { ValidationReportWriter } from './ports/validation-report-writer.js';
export {
  countDuplicateOccurrences,
  detectDuplicates,
  groupRecordsByMerchant,
} from './services/analyze-input.js';
export {
  isValidInputRecord,
  validateReceivedUrl,
} from './services/validate-url.js';
export { ValidateInputUseCase } from './use-cases/validate-input.js';
