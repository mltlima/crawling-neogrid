# Project rules

- Use Node.js LTS, npm and TypeScript with strict mode.
- This is a CLI batch crawler, not an HTTP API.
- Keep input, crawling, parsing, processing and output separated.
- Preserve the required seven-field output schema.
- Never use credentials, stealth plugins, CAPTCHA solving or proxy rotation.
- All concurrency and retry settings must be configurable.
- Unit and CI tests must never call the live iFood website.
- Every change must pass lint, typecheck, tests and build.
- Do not add production dependencies without explaining their purpose.
- Implement one phase at a time and create a Git checkpoint after validation.
