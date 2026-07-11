# iFood Batch Crawler

Crawler batch via CLI para o desafio técnico da Neogrid. A Etapa 2 lê, valida, normaliza e analisa entradas de forma totalmente offline; ainda não existe coleta de produtos.

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

São aceitos `.xlsx`, `.csv`, `.txt` e `.json`. XLSX e CSV exigem uma coluna `url` (case-insensitive); TXT recebe uma URL por linha; JSON recebe um array de strings ou de objetos com a propriedade `url`. Não há comando de coleta nesta etapa.

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

Consulte [docs/architecture.md](docs/architecture.md), [docs/adr/0001-project-foundation.md](docs/adr/0001-project-foundation.md) e [docs/adr/0002-input-validation.md](docs/adr/0002-input-validation.md) para as decisões arquiteturais.
