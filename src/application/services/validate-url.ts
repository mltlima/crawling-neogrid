import type {
  InputValidationErrorCode,
  InvalidInputRecord,
  ReceivedUrl,
  ValidInputRecord,
} from '../../domain/index.js';

const IFOOD_HOST = 'www.ifood.com.br';
const IDENTIFIER_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELIVERY_PATH_PATTERN = /^\/delivery\/([^/]+)\/([^/]+)\/([^/]+)\/?$/;

type UrlValidationResult = ValidInputRecord | InvalidInputRecord;

function invalid(
  record: ReceivedUrl,
  errorCode: InputValidationErrorCode,
  message: string,
): InvalidInputRecord {
  return {
    originalIndex: record.originalIndex,
    lineNumber: record.lineNumber,
    originalValue: record.value,
    errorCode,
    message,
  };
}

export function isValidInputRecord(
  record: UrlValidationResult,
): record is ValidInputRecord {
  return 'normalizedUrl' in record;
}

export function validateReceivedUrl(record: ReceivedUrl): UrlValidationResult {
  if (record.value === null || record.value === undefined) {
    return invalid(record, 'EMPTY_VALUE', 'A URL está vazia.');
  }

  if (typeof record.value !== 'string') {
    return invalid(record, 'INVALID_URL', 'A URL deve ser um texto.');
  }

  const originalUrl = record.value;
  const trimmedUrl = originalUrl.trim();
  if (trimmedUrl.length === 0) {
    return invalid(record, 'EMPTY_VALUE', 'A URL está vazia.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return invalid(record, 'INVALID_URL', 'O valor não é uma URL válida.');
  }

  if (parsedUrl.protocol !== 'https:') {
    return invalid(record, 'INVALID_PROTOCOL', 'A URL deve utilizar HTTPS.');
  }

  if (parsedUrl.hostname !== IFOOD_HOST) {
    return invalid(
      record,
      'INVALID_HOST',
      `A URL deve pertencer exatamente ao host ${IFOOD_HOST}.`,
    );
  }

  if (parsedUrl.username.length > 0 || parsedUrl.password.length > 0) {
    return invalid(
      record,
      'EMBEDDED_CREDENTIALS',
      'A URL não pode conter usuário ou senha.',
    );
  }

  if (parsedUrl.port.length > 0) {
    return invalid(
      record,
      'CUSTOM_PORT',
      'A URL não pode utilizar uma porta personalizada.',
    );
  }

  const pathMatch = DELIVERY_PATH_PATTERN.exec(parsedUrl.pathname);
  if (pathMatch === null) {
    return invalid(
      record,
      'INVALID_PATH',
      'O caminho deve seguir /delivery/{localidade}/{loja}/{merchantId}.',
    );
  }

  const [, locality, storeSlug, merchantId] = pathMatch;
  if (
    locality === undefined ||
    storeSlug === undefined ||
    merchantId === undefined
  ) {
    return invalid(record, 'INVALID_PATH', 'O caminho da URL está incompleto.');
  }

  if (!IDENTIFIER_PATTERN.test(merchantId)) {
    return invalid(
      record,
      'INVALID_MERCHANT_ID',
      'O merchantId deve ser um UUID válido.',
    );
  }

  const itemId = parsedUrl.searchParams.get('item');
  if (itemId === null || itemId.trim().length === 0) {
    return invalid(
      record,
      'MISSING_ITEM_ID',
      'A URL deve possuir o parâmetro item.',
    );
  }

  if (!IDENTIFIER_PATTERN.test(itemId)) {
    return invalid(
      record,
      'INVALID_ITEM_ID',
      'O itemId deve ser um UUID válido.',
    );
  }

  const normalizedMerchantId = merchantId.toLowerCase();
  const normalizedItemId = itemId.toLowerCase();
  const normalizedUrl = new URL(parsedUrl.href);
  normalizedUrl.hash = '';
  normalizedUrl.pathname = `/delivery/${locality}/${storeSlug}/${normalizedMerchantId}`;
  normalizedUrl.searchParams.set('item', normalizedItemId);
  normalizedUrl.searchParams.sort();

  return {
    originalIndex: record.originalIndex,
    lineNumber: record.lineNumber,
    originalUrl,
    normalizedUrl: normalizedUrl.href,
    storeBaseUrl: `${normalizedUrl.origin}${normalizedUrl.pathname}`,
    locality,
    storeSlug,
    merchantId: normalizedMerchantId,
    itemId: normalizedItemId,
  };
}
