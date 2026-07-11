# Arquitetura

## Objetivo da fundação

O projeto é um processo batch acionado por CLI, não uma API HTTP. A fundação estabelece limites para que entrada, crawling, parsing/processamento e saída possam evoluir e ser testados separadamente.

## Fluxo implementado

```text
CLI -> aplicação -> portas de domínio
                       |-> adapter de entrada
                       |-> adapter crawler/iFood -> infraestrutura de browser/fila
                       `-> adapter de saída -> infraestrutura de persistência

configuração e observabilidade atravessam o processo sem conter regras de domínio
```

O domínio e a aplicação não devem importar implementações de adapters ou infraestrutura. A composição concreta ficará na camada CLI.

## Diretórios

- `src/cli`: composição do processo e interface de linha de comando.
- `src/config`: leitura, coerção e validação do ambiente.
- `src/domain`: schemas strict, tipos, invariantes e contratos independentes de tecnologia.
- `src/application`: porta de leitura, validação pura, análise e caso de uso do lote.
- `src/adapters/input`: transformação das entradas externas para as portas da aplicação.
- `src/adapters/crawler/ifood`: cadeia de extração network, dados embutidos e DOM.
- `src/adapters/output`: serialização do contrato de saída.
- `src/infrastructure/browser`: ciclo de vida gerenciado do Playwright e isolamento por contexto.
- `src/infrastructure/queue`: concorrência, backpressure e retries futuros.
- `src/infrastructure/persistence`: escrita e checkpoints futuros.
- `src/observability`: logger estruturado e telemetria operacional.
- `src/shared`: primitivas genuinamente compartilhadas.
- `tests/unit`, `tests/integration`, `tests/fixtures`: testes offline e seus dados controlados.
- `input`, `artifacts`, `evidence`, `deliverables`: dados locais e materiais de entrega, ignorados por padrão, exceto pelos marcadores de diretório.

## Invariantes

- O contrato futuro de produto está materializado como um schema strict com exatamente `title`, `normal_price`, `discount_price`, `product_url`, `image_url`, `status` e `error_message`. Campos adicionais são rejeitados.
- Configurações de concorrência e retry nunca serão constantes escondidas na implementação.
- Testes unitários e de CI usam fixtures e doubles; chamadas ao iFood são proibidas.
- Credenciais, mecanismos de stealth, resolução de CAPTCHA e rotação de proxies estão fora do projeto.
- Logs são JSON e campos comuns de segredo são redigidos.

## Pipeline offline de entrada

```text
caminho -> inspector -> seleção por extensão -> InputReader -> InputBatch
                                                           |
                                                           v
                                    validação individual de URLs
                                      | válidas       | inválidas
                                      v               v
                           duplicidades/grupos     erros por registro
                                      \               /
                                       resumo do lote
```

`ValidateInputUseCase` conhece apenas `InputReader` e `InputFileInspector`. ExcelJS e csv-parse ficam restritos aos adapters. A composição concreta ocorre na CLI, permitindo testar a aplicação com qualquer origem que produza o contrato comum.

O relatório de validação é escrito por `ValidationReportWriter`; a implementação JSON fica em `adapters/output`. O writer cria diretórios pais e converte qualquer falha de persistência em `REPORT_WRITE_FAILED`. A CLI imprime sempre o mesmo resumo JSON e traduz o resultado em exit code 0 (todos válidos), 2 (rejeições por registro) ou 1 (falha operacional).

## Probe Playwright

`ProbeProductUseCase` usa a mesma coleta individual do batch e acrescenta validação da URL e persistência de evidências. `BrowserSessionFactory` abre uma sessão gerenciada; cada coleta cria contexto e página em um `try/finally` e os fecha mesmo quando `newContext`, `newPage` ou setup falham. O adapter iFood encadeia `network`, `embedded-data` e `dom`, interrompendo após o primeiro produto válido com correspondência exata de `itemId`.

Antes de ler um body, a sessão rejeita imagens, fontes, CSS, mídia, content types não JSON, URLs irrelevantes e `content-length` acima de 1 MB. O body carregado também é limitado. A espera termina por resposta com o item exato, sinal terminal no DOM ou settle timeout configurável.

Evidências persistem apenas resumos de respostas, diagnósticos sanitizados e limitados, resultado, screenshot condicional e trace opcional. Payloads, headers, cookies e storages não são gravados. Trace fica desligado por padrão e é tratado como material potencialmente sensível que exige revisão antes de qualquer entrega.

## Pipeline batch sequencial

`CrawlBatchUseCase` valida a entrada, ordena e limita apenas registros válidos, abre uma única sessão de browser e aguarda cada coleta em um loop sequencial. Contexto e página novos impedem compartilhamento de cookies e storage. Falhas individuais viram produtos de erro seguros; falha ao abrir o browser permanece fatal. Objetos pesados da página não integram o resultado.

O resultado técnico separa metadados operacionais do objeto strict de sete campos. `BatchReportWriter` grava esse resultado em JSON UTF-8 por temporário e rename no mesmo diretório; stdout recebe somente o resumo. Screenshots e traces ficam desativados no batch. O desenho ainda não contém concorrência, retry, checkpoint ou export final.
