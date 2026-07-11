import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/cli/composition.ts',
        'src/cli/index.ts',
        'src/cli/version.ts',
        'src/infrastructure/browser/playwright-browser-session.ts',
        'src/**/index.ts',
      ],
      include: [
        'src/adapters/input/**/*.ts',
        'src/adapters/output/**/*.ts',
        'src/adapters/crawler/ifood/**/*.ts',
        'src/application/**/*.ts',
        'src/cli/program.ts',
        'src/config/**/*.ts',
        'src/domain/**/*.ts',
        'src/infrastructure/browser/**/*.ts',
        'src/observability/**/*.ts',
      ],
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    mockReset: true,
    restoreMocks: true,
  },
});
