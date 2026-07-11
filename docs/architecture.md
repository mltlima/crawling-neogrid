# Arquitetura

## Objetivo da fundação

O projeto é um processo batch acionado por CLI, não uma API HTTP. A fundação estabelece limites para que entrada, crawling, parsing/processamento e saída possam evoluir e ser testados separadamente.

## Fluxo planejado

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
- `src/domain`: entidades, invariantes e portas independentes de tecnologia.
- `src/application`: casos de uso e processamento do lote.
- `src/adapters/input`: transformação das entradas externas para as portas da aplicação.
- `src/adapters/crawler/ifood`: implementação futura do coletor específico.
- `src/adapters/output`: serialização do contrato de saída.
- `src/infrastructure/browser`: ciclo de vida futuro do Playwright.
- `src/infrastructure/queue`: concorrência, backpressure e retries futuros.
- `src/infrastructure/persistence`: escrita e checkpoints futuros.
- `src/observability`: logger estruturado e telemetria operacional.
- `src/shared`: primitivas genuinamente compartilhadas.
- `tests/unit`, `tests/integration`, `tests/fixtures`: testes offline e seus dados controlados.
- `input`, `artifacts`, `evidence`, `deliverables`: dados locais e materiais de entrega, ignorados por padrão, exceto pelos marcadores de diretório.

## Invariantes

- O contrato final terá exatamente os sete campos exigidos. Ele ainda não é materializado nesta etapa porque não foi implementado nenhum domínio ou output; fases futuras devem introduzi-lo como um único tipo validado e coberto por testes de contrato.
- Configurações de concorrência e retry nunca serão constantes escondidas na implementação.
- Testes unitários e de CI usam fixtures e doubles; chamadas ao iFood são proibidas.
- Credenciais, mecanismos de stealth, resolução de CAPTCHA e rotação de proxies estão fora do projeto.
- Logs são JSON e campos comuns de segredo são redigidos.
