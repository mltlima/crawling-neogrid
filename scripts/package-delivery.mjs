import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ZipArchive } from 'archiver';

await mkdir('release', { recursive: true });
const directory = process.env.DELIVERY_DIR ?? 'deliverables';
const fileName = process.env.RELEASE_NAME ?? 'crawling-neogrid-v1.0.0.zip';
const path = `release/${fileName}`;
await new Promise((resolve, reject) => {
  const output = createWriteStream(path);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.pipe(output);
  archive.directory(directory, 'deliverables');
  archive.directory('evidence', 'evidence');
  archive.file('README.md', { name: 'README.md' });
  archive.finalize();
});
const digest = createHash('sha256')
  .update(await readFile(path))
  .digest('hex');
await writeFile(`${path}.sha256`, `${digest}  ${fileName}\n`);
console.log(path);
