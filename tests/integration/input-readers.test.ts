import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CsvInputReader,
  JsonInputReader,
  TxtInputReader,
  XlsxInputReader,
} from '../../src/adapters/input/index.js';
import { InputOperationalError } from '../../src/application/index.js';
import { makeIfoodUrl } from '../fixtures/input-values.js';

describe('input readers', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ifood-input-readers-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reads TXT and retains empty physical lines', async () => {
    const filePath = join(directory, 'input.txt');
    await writeFile(filePath, `${makeIfoodUrl()}\n\ninvalid`, 'utf8');

    const batch = await new TxtInputReader().read(filePath);

    expect(batch.records).toHaveLength(3);
    expect(batch.records[1]).toEqual({
      originalIndex: 1,
      lineNumber: 2,
      value: '',
    });
  });

  it('reads both supported JSON shapes', async () => {
    const filePath = join(directory, 'input.json');
    await writeFile(
      filePath,
      JSON.stringify([makeIfoodUrl(), { url: makeIfoodUrl() }, { url: '' }]),
      'utf8',
    );

    const batch = await new JsonInputReader().read(filePath);

    expect(batch.records.map((record) => record.value)).toEqual([
      makeIfoodUrl(),
      makeIfoodUrl(),
      '',
    ]);
  });

  it('reads a case-insensitive CSV URL column and an empty value', async () => {
    const filePath = join(directory, 'input.csv');
    await writeFile(
      filePath,
      `name,URL\nfirst,${makeIfoodUrl()}\n\nempty,\n`,
      'utf8',
    );

    const batch = await new CsvInputReader().read(filePath);

    expect(batch.records).toHaveLength(3);
    expect(batch.records[0]?.lineNumber).toBe(2);
    expect(batch.records[1]?.value).toBe('');
    expect(batch.records[2]?.value).toBe('');
  });

  it('reads XLSX including blank rows between records', async () => {
    const filePath = join(directory, 'input.xlsx');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('input');
    worksheet.getCell('A1').value = 'URL';
    worksheet.getCell('A2').value = makeIfoodUrl();
    worksheet.getCell('A4').value = 'invalid';
    await workbook.xlsx.writeFile(filePath);

    const batch = await new XlsxInputReader().read(filePath);

    expect(batch.records).toHaveLength(3);
    expect(batch.records[1]).toEqual({
      originalIndex: 1,
      lineNumber: 3,
      value: '',
    });
  });

  it('reports malformed JSON and missing CSV URL columns clearly', async () => {
    const jsonPath = join(directory, 'bad.json');
    const csvPath = join(directory, 'bad.csv');
    await writeFile(jsonPath, '{bad', 'utf8');
    await writeFile(csvPath, 'name\nproduct\n', 'utf8');

    await expect(new JsonInputReader().read(jsonPath)).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
    await expect(new CsvInputReader().read(csvPath)).rejects.toMatchObject({
      code: 'MISSING_URL_COLUMN',
    });
  });

  it('reports unsupported JSON roots and unreadable XLSX contents', async () => {
    const jsonPath = join(directory, 'object.json');
    const xlsxPath = join(directory, 'broken.xlsx');
    await writeFile(jsonPath, JSON.stringify({ url: makeIfoodUrl() }), 'utf8');
    await writeFile(xlsxPath, 'not-an-xlsx', 'utf8');

    await expect(new JsonInputReader().read(jsonPath)).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
    await expect(new XlsxInputReader().read(xlsxPath)).rejects.toMatchObject({
      code: 'FILE_UNREADABLE',
    });
  });

  it('rejects empty logical JSON arrays', async () => {
    const filePath = join(directory, 'empty.json');
    await writeFile(filePath, '[]', 'utf8');

    await expect(new JsonInputReader().read(filePath)).rejects.toBeInstanceOf(
      InputOperationalError,
    );
  });
});
