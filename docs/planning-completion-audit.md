# Auditoria do planejamento final

Data: 13/07/2026. Nenhum commit ou push foi feito nesta execução.

| Seção                     | Estado    | Evidência                                                                         |
| ------------------------- | --------- | --------------------------------------------------------------------------------- |
| Auditoria e quality gates | concluída | 175 testes, cobertura acima dos limites, lint, tipos e build aprovados            |
| Verificação end-to-end    | concluída | JSONL, CSV, manifesto e relatório verificados automaticamente                     |
| Checkpoint e encerramento | concluída | journal com 999 resultados, lock, resume e sinais testados                        |
| Docker, Compose e CI      | concluída | imagens, execução como usuário não-root, workflows, CodeQL, Trivy e SBOM          |
| Benchmark                 | concluída | benchmark offline de 1.000 itens e resume 500+500                                 |
| Execução oficial          | concluída | 999/999 processadas, nenhuma pulada e nenhuma parada global                       |
| Evidências de falha       | concluída | 934 screenshots, um para cada resultado com erro                                  |
| Artefatos finais          | concluída | `deliverables/products.jsonl`, `products.csv`, relatório, manifesto e verificação |
| Documentação              | concluída | README, arquitetura, runbook, ADRs e relatório de execução atualizados            |

## Resultado factual

A execução oficial encontrou 65 produtos e registrou 934 falhas: 478 redirecionamentos para a home, 437 respostas classificadas como bloqueio de acesso e 19 estados desconhecidos. Todas as URLs foram visitadas; o volume de falhas não interrompeu o lote. Nenhum produto foi inventado para URLs que não forneceram dados válidos.
