#!/usr/bin/env node

import 'dotenv/config';

import { InputOperationalError } from '../application/index.js';
import { runCli } from './program.js';

try {
  await runCli();
} catch (error: unknown) {
  const message =
    error instanceof InputOperationalError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : 'Erro inesperado ao executar a CLI.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
