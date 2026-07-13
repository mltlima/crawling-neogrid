# ADR 0007: Containerização e entrega verificável

## Status

Aceito.

## Decisão

Usar build multi-stage e runtime oficial Playwright como usuário não-root. Entregáveis JSONL/CSV só são considerados prontos após manifest e verificação independente de hashes, tamanhos, ordem, schema e métricas. Compose fornece mounts explícitos e CI valida container e supply chain offline.

## Consequências

A imagem é maior que uma imagem Node simples, mas reproduz Chromium. A verificação acrescenta I/O linear e impede promoção silenciosa de arquivos contraditórios.
