# ADR 0005 — Concorrência limitada e resiliência

## Contexto

O lote sequencial era correto, mas o case exige estabilidade para até mil URLs, controle de concorrência, limitação de acesso e retentativas. O ambiente live permanece bloqueado e não faz parte desta validação.

## Decisão

Usamos um worker pool nativo limitado por configuração. Workers retiram itens de um cursor, mantêm retries no mesmo slot e compartilham um pacer FIFO. Um browser atende contextos isolados concorrentes; seus leases possuem geração e invalidações da mesma geração são coalescidas.

A política permite retry de timeout, 429, HTTP 5xx e browser realmente desconectado. Bloqueio, localização, indisponibilidade, HTTP 4xx, parsing, extração e erro inesperado são terminais. O atraso é `min(base * 2^índice, teto)`, reduzido por jitter configurável e elevado por `Retry-After` válido, sempre limitado pelo teto.

Cada resultado registra um histórico pequeno de tentativas, sem HTML, payload, headers ou URL adicional. A ordem final é por `originalIndex`. O circuit breaker abre por bloqueios consecutivos, rate limits esgotados ou falha de recuperação; itens não iniciados são contabilizados sem produto fictício.

## Consequências e riscos

Há throughput controlado sem explosão de promessas, auditoria de retries e recuperação única do browser. Concorrência pode alterar a ordem de conclusão, por isso a ordenação é explícita. O breaker privilegia segurança e pode encerrar cedo diante de um padrão sistêmico.

## Adiado

Checkpoint, retomada, persistência incremental, export final JSON/CSV/XLSX, cache por merchant e qualquer execução live do arquivo oficial ficam para etapas posteriores.
