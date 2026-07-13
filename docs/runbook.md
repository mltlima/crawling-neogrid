# Runbook

1. Execute `npm ci`, instale Chromium e rode `npm run validate`.
2. Valide a entrada com `validate-input`.
3. Faça smoke de uma URL e lote de 10 antes do lote completo.
4. Use checkpoint exclusivo e configuração conservadora (`concurrency=2`, intervalo >= 500 ms).
5. Após interrupção, repita o comando com `--resume`. Não altere entrada ou limite.

Lock residual: confirme que não há processo ativo antes de `--force-unlock`; lock ativo é recusado. Browser desconectado pode gerar recuperação/retry. `RATE_LIMITED` exige reduzir ritmo. `ACCESS_BLOCKED` e verificação humana encerram o caminho sem interação automatizada. `REDIRECTED_TO_HOME` é falha real. Arquivos incompletos permanecem para diagnóstico e não são promovidos como entrega.

Se `output-verification.json` for inválido, examine hashes, tamanhos, ordem, contagens e schema; não apague checkpoint. No Docker use volumes de entrada read-only e saídas graváveis. Nunca entregue trace, cookies, storage state, tokens ou logs não sanitizados.
