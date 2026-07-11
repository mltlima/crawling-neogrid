# ADR 0004 — Pipeline batch sequencial

## Contexto

O probe controlado comprovou a cadeia de extração, mas a execução live encontrou verificação humana. Era necessário evoluir para um lote testável offline sem ampliar mecanismos de acesso.

## Decisão

Começamos com concorrência efetiva igual a um. O lote reutiliza um processo Chromium e cria um `BrowserContext` e uma `Page` por URL, eliminando compartilhamento de cookies, storage e sessão. A coleta individual é compartilhada com `probe-url`; o probe persiste evidências, enquanto o batch desliga screenshot e trace e descarta objetos pesados ao fim de cada item.

Falhas individuais são convertidas em resultados seguros e o lote continua. Uma falha de abertura do browser é fatal. Metadados técnicos ficam fora do objeto strict de produto com sete campos. O relatório intermediário é JSON UTF-8 escrito atomicamente por temporário e rename.

## Limite offline

Testes usam doubles, fixtures e servidor em `127.0.0.1`. O desenvolvimento offline pode prosseguir, mas a planilha oficial não pode ser executada live enquanto não houver acesso normal e autorizado. O bloqueio humano é terminal e não é clicado, resolvido ou contornado.

## Consequências e riscos

O fluxo é previsível, observável e simples de depurar, porém o throughput é limitado. Um browser único reduz custo, mas sua falha inicial impede todo o lote. O relatório é técnico e não substitui o entregável final.

## Adiado deliberadamente

Concorrência, worker pool, retry/backoff, recuperação de browser, checkpoint/resume, deduplicação, cache por merchant e export final JSONL/CSV pertencem a etapas posteriores.
