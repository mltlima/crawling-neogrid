# Resultados do spike controlado

## Ambiente e data

- Data: 2026-07-10
- Ambiente: Windows, Node.js 20, Playwright 1.61.1, Chromium 149
- Execução automatizada: servidor local `127.0.0.1`, sem acesso ao iFood

## Observações offline

- JSON carregado pela página foi extraído como `network`.
- JSON em script foi extraído como `embedded-data`.
- Título, preços e imagem no HTML foram extraídos como `dom`.
- 403, 429, timeout, erro JavaScript, indisponibilidade e estrutura desconhecida foram classificados separadamente.
- Query strings foram removidas dos resumos e payloads acima do limite não foram parseados.

## Validação live

Não executada. Nenhuma URL real/autorização específica foi fornecida junto ao planejamento. Portanto não há URL mascarada, resposta candidata real ou fonte real escolhida a registrar. Nenhuma tentativa de contornar localização, CAPTCHA, bloqueio ou rate limit foi feita.

## Limitações e riscos

- Fixtures são sintéticas e sanitizadas; os nomes reais dos campos precisam ser confirmados.
- DOM e estado embutido podem mudar sem aviso.
- Localização pode ser exigida mesmo sem credenciais.
- A próxima etapa não deve iniciar até uma execução manual autorizada confirmar ou ajustar os parsers.

## Decisão provisória

Manter network → embedded-data → DOM e executar no máximo três URLs autorizadas, uma por vez e sem retry, antes de desenhar processamento em lote.
