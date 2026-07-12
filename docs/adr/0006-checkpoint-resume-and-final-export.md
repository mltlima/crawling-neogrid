# ADR 0006 — Checkpoint, retomada e exportação final

## Decisão

Cada lote possui um diretório de checkpoint com manifesto atômico, journal append-only de resultados, journal de eventos e lock exclusivo. O hash SHA-256 do arquivo de entrada identifica a execução; retomadas incompatíveis são rejeitadas.

Um resultado só é confirmado após validação e append durável no journal. O replay aceita somente uma última linha incompleta; corrupção no meio do journal e resultados conflitantes são recusados. Resultados já confirmados não entram novamente no pool.

Arquivos finais são promovidos atomicamente apenas quando todos os registros selecionados foram confirmados, não há entrada inválida ou item pulado. JSONL e CSV contêm exclusivamente o produto strict de sete campos, em `originalIndex` crescente. Um manifesto de artefatos registra hashes e tamanhos finais.

## Consequências

Interrupções preservam trabalho confirmado e permitem retomada segura. Lock residual exige ação explícita. Checkpoint e relatório técnico podem ter metadados; produtos exportados não.

## Adiado

Evidências live, revisão final da entrega, otimização por merchant e qualquer mecanismo de acesso ao iFood não fazem parte desta etapa.
