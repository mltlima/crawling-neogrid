import {
  pino,
  stdTimeFunctions,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from 'pino';

import type { AppConfig } from '../config/index.js';

export interface CreateLoggerOptions {
  readonly level: AppConfig['logLevel'];
  readonly serviceName?: string;
}

export function createLogger(
  options: CreateLoggerOptions,
  destination?: DestinationStream,
): Logger {
  const loggerOptions: LoggerOptions = {
    base: {
      service: options.serviceName ?? 'ifood-crawler',
    },
    level: options.level,
    redact: {
      censor: '[Redacted]',
      paths: ['authorization', 'password', 'token'],
    },
    timestamp: stdTimeFunctions.isoTime,
  };

  return destination === undefined
    ? pino(loggerOptions)
    : pino(loggerOptions, destination);
}
