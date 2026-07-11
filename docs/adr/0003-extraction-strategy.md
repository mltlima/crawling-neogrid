# ADR 0003: Estratégia do probe de produto

- Status: aceito para spike offline; validação live pendente
- Data: 2026-07-10

## Decisão

Executar uma URL validada por vez em Chromium isolado, locale `pt-BR` e timezone `America/Sao_Paulo`. Browser, contexto e página compartilham um único escopo de fechamento defensivo. A extração segue respostas JSON iniciadas pela própria página, scripts estruturados e DOM. A primeira estratégia com `itemId` exato encerra a cadeia; objetos sem ID ou de outro item são rejeitados.

Valores monetários são inteiros em centavos. O contrato de sete campos rejeita desconto acima do preço normal e mantém a relação entre `status` e `error_message`. Estado da página é um contrato separado do produto.

Respostas são resumidas sem query string, headers ou cookies. Resource type, content type, URL, `content-length` e limite de 1 MB são avaliados antes de ler o body. A espera é limitada e orientada a sinais de resposta, produto, bloqueio, indisponibilidade ou localização. Chamadas observadas nunca são repetidas diretamente.

Console e page errors são sanitizados e limitados antes da persistência. Trace é opt-in, pode conter estado temporário da sessão e não pode ser versionado nem entregue bruto sem revisão.

## Consequências

- Parsers e classificação são testáveis por fixtures sanitizadas.
- Integração usa servidor HTTP local e Chromium real, sem tráfego ao iFood.
- Mudanças da página podem quebrar seletores e formatos; a cadeia limita o impacto.
- A estrutura live real ainda precisa ser comparada às fixtures antes de decisões de lote.
- O desafio de verificação humana observado é um estado terminal; o sistema não clica, resolve ou tenta contorná-lo.
