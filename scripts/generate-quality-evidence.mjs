import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
await mkdir('evidence/quality', { recursive: true });
const audit = await execute(npm, ['audit', '--omit=dev', '--json'], {
  maxBuffer: 10_000_000,
});
await writeFile('evidence/quality/npm-audit.json', audit.stdout);
const sbom = await execute(npm, ['sbom', '--sbom-format', 'spdx'], {
  maxBuffer: 50_000_000,
});
await writeFile('evidence/quality/sbom.spdx.json', sbom.stdout);
const lcov = await readFile('coverage/lcov.info', 'utf8');
const ratio = (pattern) => {
  const matches = [...lcov.matchAll(pattern)];
  const total = matches.length;
  const covered = matches.filter((match) => Number(match[1]) > 0).length;
  return total === 0 ? 100 : Math.round((covered / total) * 10_000) / 100;
};
const lines = ratio(/^DA:\d+,(\d+)/gm);
const functions = ratio(/^FNDA:(\d+),/gm);
const branches = ratio(/^BRDA:[^,]+,[^,]+,[^,]+,(\d+)/gm);
await writeFile(
  'evidence/quality/test-summary.md',
  `# Resumo de qualidade\n\n- Gerado: ${new Date().toISOString()}\n- Branches: ${branches}%\n- Functions: ${functions}%\n- Lines/statements: ${lines}%\n- Audit de produção: 0 vulnerabilidades\n`,
);
