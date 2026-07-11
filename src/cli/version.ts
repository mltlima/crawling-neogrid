import { readFileSync } from 'node:fs';

const packageJson: unknown = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

function readVersion(metadata: unknown): string {
  if (
    typeof metadata === 'object' &&
    metadata !== null &&
    'version' in metadata &&
    typeof metadata.version === 'string'
  ) {
    return metadata.version;
  }

  throw new Error('The package version is missing or invalid.');
}

export const VERSION = readVersion(packageJson);
