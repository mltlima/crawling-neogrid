import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CsvProductExporter,
  JsonlProductExporter,
} from '../../../src/adapters/output/index.js';
import {
  productOutputSchema,
  type ProductOutput,
} from '../../../src/domain/index.js';

const dirs: string[] = [];
const product: ProductOutput = {
  title: 'A, "B"',
  normal_price: 123,
  discount_price: null,
  product_url: 'https://example.test/product',
  image_url: null,
  status: 'success',
  error_message: null,
};
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
describe('final product exporters', () => {
  it('writes JSONL and CSV with exactly the seven product fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'exports-'));
    dirs.push(dir);
    const jsonl = join(dir, 'products.jsonl');
    const csv = join(dir, 'products.csv');
    await new JsonlProductExporter().write(jsonl, [product]);
    await new CsvProductExporter().write(csv, [product]);
    expect(
      Object.keys(
        productOutputSchema.parse(
          JSON.parse((await readFile(jsonl, 'utf8')).trim()) as unknown,
        ),
      ),
    ).toEqual([
      'title',
      'normal_price',
      'discount_price',
      'product_url',
      'image_url',
      'status',
      'error_message',
    ]);
    expect(await readFile(csv, 'utf8')).toBe(
      'title,normal_price,discount_price,product_url,image_url,status,error_message\n"A, ""B""",123,,https://example.test/product,,success,\n',
    );
  });
});
