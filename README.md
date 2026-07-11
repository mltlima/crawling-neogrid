# iFood Batch Crawler

Fundação de um crawler batch via CLI para o desafio técnico da Neogrid. A Etapa 1 não acessa o iFood, não coleta dados e não contém lógica de crawling.

## Requisitos

- Node.js LTS (20.11 ou superior; Node 22 é usado no CI e no build Docker)
- npm 10+

## Preparação

```bash
npm ci
cp .env.example .env
```

No PowerShell, use `Copy-Item .env.example .env` no lugar de `cp`.

## CLI

Durante o desenvolvimento:

```bash
node --import tsx src/cli/index.ts --help
node --import tsx src/cli/index.ts --version
```

Após o build:

```bash
npm run build
node dist/cli/index.js --help
node dist/cli/index.js --version
```

Não há comando de coleta nesta etapa.

## Qualidade

```bash
npm run validate
```

O comando executa formatação, lint, typecheck, testes offline com cobertura e build. Testes unitários e de CI não fazem chamadas ao site do iFood.

## Configuração

As variáveis são documentadas em `.env.example` e validadas com Zod. Concorrência e retries são configuráveis desde a fundação, embora ainda não sejam usados:

| Variável                 |                     Padrão | Regra                                 |
| ------------------------ | -------------------------: | ------------------------------------- |
| `NODE_ENV`               |              `development` | `development`, `test` ou `production` |
| `LOG_LEVEL`              |                     `info` | nível aceito pelo Pino                |
| `CRAWLER_CONCURRENCY`    |                        `2` | inteiro entre 1 e 20                  |
| `CRAWLER_MAX_RETRIES`    |                        `3` | inteiro entre 0 e 10                  |
| `CRAWLER_RETRY_DELAY_MS` |                     `1000` | inteiro não negativo                  |
| `BROWSER_HEADLESS`       |                     `true` | `true`/`false` ou `1`/`0`             |
| `INPUT_PATH`             |                  `./input` | caminho não vazio                     |
| `OUTPUT_PATH`            | `./artifacts/output.jsonl` | caminho não vazio                     |

## Dependências de produção

- `commander`: contrato e ajuda da CLI.
- `dotenv`: carregamento local de variáveis de ambiente.
- `zod`: validação e tipagem da configuração.
- `pino`: logs estruturados em JSON com redação de campos sensíveis.
- `playwright`: base de automação futura e alinhamento com a imagem oficial do container; não é usado para coleta nesta etapa.

Consulte [docs/architecture.md](docs/architecture.md) e [docs/adr/0001-project-foundation.md](docs/adr/0001-project-foundation.md) para as decisões arquiteturais.
