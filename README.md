# iFood Batch Crawler

Crawler batch via CLI para o desafio técnico da Neogrid. A Etapa 4 combina validação de entrada, coleta sequencial isolada com Playwright e relatório técnico, com desenvolvimento e testes inteiramente offline.

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

Para validar uma entrada e imprimir o resumo em JSON:

```bash
node dist/cli/index.js validate-input --input ./input/urls.csv
```

Para também salvar o relatório completo (lote, registros válidos e inválidos, duplicidades, grupos e resumo):

```bash
node dist/cli/index.js validate-input \
  --input ./input/urls.csv \
  --report ./artifacts/input-validation.json
```

A saída do terminal continua sendo o resumo em JSON, com ou sem `--report`.

### Exit codes

| Código | Significado                                                           |
| -----: | --------------------------------------------------------------------- |
|    `0` | Arquivo processado e todos os registros válidos.                      |
|    `2` | Arquivo processado, mas existe pelo menos um registro inválido.       |
|    `1` | Erro operacional, incluindo leitura, formato ou escrita do relatório. |

São aceitos `.xlsx`, `.csv`, `.txt` e `.json`. XLSX e CSV exigem uma coluna `url` (case-insensitive); TXT recebe uma URL por linha; JSON recebe um array de strings ou de objetos com a propriedade `url`.

## Qualidade

```bash
npm run validate
```

O comando executa formatação, lint, typecheck, testes offline com cobertura e build. Testes unitários e de CI não fazem chamadas ao site do iFood.

## Configuração

As variáveis são documentadas em `.env.example` e validadas com Zod. Concorrência e retries são configuráveis desde a fundação, embora ainda não sejam usados:

| Variável                            |                     Padrão | Regra                                 |
| ----------------------------------- | -------------------------: | ------------------------------------- |
| `NODE_ENV`                          |              `development` | `development`, `test` ou `production` |
| `LOG_LEVEL`                         |                     `info` | nível aceito pelo Pino                |
| `CRAWLER_CONCURRENCY`               |                        `2` | inteiro entre 1 e 20                  |
| `CRAWLER_MAX_RETRIES`               |                        `3` | inteiro entre 0 e 10                  |
| `CRAWLER_RETRY_DELAY_MS`            |                     `1000` | inteiro não negativo                  |
| `CRAWLER_RETRY_MAX_DELAY_MS`        |                    `30000` | teto do backoff em ms                 |
| `CRAWLER_RETRY_JITTER_RATIO`        |                      `0.2` | número entre 0 e 1                    |
| `CRAWLER_MIN_REQUEST_INTERVAL_MS`   |                      `500` | intervalo global em ms                |
| `CRAWLER_CIRCUIT_BREAKER_THRESHOLD` |                        `3` | falhas sistêmicas consecutivas, 1–100 |
| `BROWSER_HEADLESS`                  |                     `true` | `true`/`false` ou `1`/`0`             |
| `INPUT_PATH`                        |                  `./input` | caminho não vazio                     |
| `OUTPUT_PATH`                       | `./artifacts/output.jsonl` | caminho não vazio                     |

## Dependências de produção

- `commander`: contrato e ajuda da CLI.
- `dotenv`: carregamento local de variáveis de ambiente.
- `zod`: validação e tipagem da configuração.
- `pino`: logs estruturados em JSON com redação de campos sensíveis.
- `playwright`: navegador gerenciado para probe isolado e coleta batch sequencial, com um contexto novo por URL.
- `exceljs`: leitura isolada de planilhas XLSX pelo adapter de entrada.
- `csv-parse`: parsing seguro de registros CSV pelo adapter de entrada.

O override de `uuid@11.1.1` corrige uma vulnerabilidade transitiva do ExcelJS mantendo compatibilidade com a função `v4()` utilizada pela biblioteca.

## Validação e normalização de URLs

Uma URL aceita usa HTTPS, host exato `www.ifood.com.br`, nenhuma credencial ou porta personalizada, caminho `/delivery/{localidade}/{loja}/{merchantId}` e query string com `item={itemId}`. `merchantId` e `itemId` devem ser UUIDs.

A URL original é preservada integralmente. A versão normalizada remove fragmento, normaliza UUIDs para minúsculas, remove a barra final do caminho e ordena os parâmetros de busca. Duplicidades são relatadas por URL normalizada, por `itemId` e por `merchantId + itemId`; nenhum registro é descartado.

Erros de uma linha não encerram o lote. O resultado mantém código, mensagem, valor e índice originais. Arquivo inexistente, vazio, ilegível, extensão não suportada ou estrutura inválida gera um erro operacional explícito.

O resumo informa totais gerais e de duplicidade, `uniqueUrls`, `uniqueItemIds`, `uniqueLocalities`, distribuições `recordsByMerchant` e `recordsByLocality`, contagem `errorsByCode` e `durationMs`. Métricas de unicidade e distribuição consideram os registros válidos; erros consideram os rejeitados.

## Probe controlado de um produto

```bash
node dist/cli/index.js probe-url \
  --url "https://www.ifood.com.br/delivery/...?..." \
  --timeout 30000 \
  --settle-timeout 5000 \
  --artifacts-dir ./artifacts \
  --trace
```

Use `--headed` somente quando precisar observar o navegador. O comando aceita uma URL por execução, valida-a antes da navegação e tenta, nesta ordem, dados JSON carregados pela página, dados embutidos e DOM. `--settle-timeout` limita a espera por item em resposta candidata, conteúdo de produto no DOM, bloqueio, indisponibilidade ou pedido de localização. Não há espera fixa, retry, concorrência, credenciais, stealth, proxy ou chamada direta a endpoints privados.

Preços são inteiros em centavos: `2590` representa R$ 25,90. O resultado informa `network`, `embedded-data`, `dom` ou `none`, além do estado independente da página. Network e embedded data só aceitam um objeto com `itemId` exato.

Evidências sanitizadas ficam em `artifacts/probes/<run-id>/`; erros têm query strings e tokens removidos e limites de tamanho/quantidade. Screenshot é automática em falha. Trace é desabilitado por padrão e só existe com `--trace`: ele pode conter dados temporários da sessão e nunca deve ser versionado ou entregue sem revisão manual.

Testes Playwright usam apenas um servidor em `127.0.0.1`. A execução live autorizada encontrou verificação humana; o probe encerrou sem clicar, resolver ou contornar o desafio. Novas execuções live não fazem parte do CI.

## Pipeline batch concorrente e resiliente

```bash
node dist/cli/index.js crawl \
  --input ./input/urls.xlsx \
  --report ./artifacts/batch-report.json \
  --limit 10 \
  --concurrency 2 \
  --max-retries 3 \
  --retry-delay 1000 \
  --retry-max-delay 30000 \
  --retry-jitter 0.2 \
  --min-request-interval 500 \
  --circuit-breaker-threshold 3 \
  --timeout 30000 \
  --settle-timeout 5000
```

O lote preserva ordem e duplicidades, compartilha normalmente um processo Chromium e cria contexto e página isolados por tentativa. Um worker pool limita os itens ativos sem criar uma promessa por URL; o pacer aplica intervalo global entre tentativas. Retries seletivos usam backoff exponencial limitado, jitter e `Retry-After`, sem repetir bloqueios ou falhas terminais. O terminal recebe somente o resumo JSON; o relatório técnico completo é escrito atomicamente. O batch não captura screenshots nem traces.

Se o browser desconectar, uma recuperação sincronizada cria apenas uma nova geração. Bloqueios ou rate limits consecutivos abrem o circuit breaker, deixam itens em voo terminar e registram os ainda não iniciados separadamente. `ACCESS_BLOCKED` nunca gera retry.

No comando `crawl`, o exit code é `0` quando todos os selecionados têm sucesso e não há entrada inválida, item pulado ou breaker aberto; `2` representa lote concluído com qualquer dessas condições; `1` representa falha operacional fatal sem relatório confiável. Checkpoint e export final ficam para etapas posteriores.

O desenvolvimento batch offline pode continuar com fixtures, doubles e servidor local. A execução live da planilha oficial permanece proibida enquanto não houver acesso normal e autorizado; nenhum lote real de 999 URLs foi executado nesta etapa.

Consulte [docs/architecture.md](docs/architecture.md) e [docs/adr/0004-sequential-batch-pipeline.md](docs/adr/0004-sequential-batch-pipeline.md) para as decisões arquiteturais.
