# ADR 0003: Estratégia do probe de produto

- Status: aceito para spike offline; validação live pendente
- Data: 2026-07-10

## Decisão

Executar uma URL validada por vez em Chromium isolado, locale `pt-BR` e timezone `America/Sao_Paulo`. A extração segue respostas JSON iniciadas pela própria página, scripts estruturados e DOM. A primeira estratégia válida encerra a cadeia.

Valores monetários são inteiros em centavos. O contrato de sete campos rejeita desconto acima do preço normal e mantém a relação entre `status` e `error_message`. Estado da página é um contrato separado do produto.

Respostas são resumidas sem query string, headers ou cookies. JSON só é analisado quando candidato e até 1 MB; chamadas observadas nunca são repetidas diretamente. Browser e contexto são fechados em `finally`.

## Consequências

- Parsers e classificação são testáveis por fixtures sanitizadas.
- Integração usa servidor HTTP local e Chromium real, sem tráfego ao iFood.
- Mudanças da página podem quebrar seletores e formatos; a cadeia limita o impacto.
- A estrutura live real ainda precisa ser comparada às fixtures antes de decisões de lote.
