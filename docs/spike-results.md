# Resultados do spike controlado

## Ambiente e data

- Data: 2026-07-11
- Ambiente: Windows, Node.js 20, Playwright 1.61.1, Chromium 149
- Execução automatizada: servidor local `127.0.0.1`, sem acesso ao iFood

## Observações offline

- JSON carregado pela página foi extraído como `network`.
- JSON em script foi extraído como `embedded-data`.
- Título, preços e imagem no HTML foram extraídos como `dom`.
- 403, 429, timeout, erro JavaScript, indisponibilidade e estrutura desconhecida foram classificados separadamente.
- Query strings foram removidas dos resumos e payloads acima do limite não foram parseados.

## Validação da planilha real

- Arquivo: `input/ifood_urls_padrao_item_1000 - JULHO.xlsx` (ignorado pelo Git).
- 999 registros válidos de 999; 11 merchants, 6 localidades e nenhuma duplicidade.
- Localidades: Brasília, São Paulo, Fortaleza, Campinas, Porto Alegre e São José dos Campos.

## Validação live controlada

- Uma URL de Brasília foi executada em 2026-07-11, com merchant e item mascarados.
- A loja carregou parcialmente, mas a página exibiu um desafio “pressione e segure” para confirmar presença humana.
- Foram observadas respostas candidatas originadas pela página, incluindo catálogo/item, mas sem persistir payloads completos ou parâmetros.
- Fonte de extração: `none`.
- Estado observado: `ACCESS_BLOCKED` (a versão inicial classificou como `PARSER_ERROR`; o classificador foi corrigido a partir da evidência sanitizada).
- Os outros dois probes planejados não foram executados. Não houve clique, resolução do desafio, retry ou tentativa de contorno.

## Limitações e riscos

- Fixtures de produto são sintéticas; os nomes reais dos campos ainda precisam ser confirmados.
- DOM e estado embutido podem mudar sem aviso.
- Localização pode ser exigida mesmo sem credenciais.
- A próxima etapa não deve iniciar até uma execução manual autorizada confirmar ou ajustar os parsers.

## Decisão provisória

Manter network → embedded-data → DOM. Não avançar para processamento em lote enquanto o acesso normal continuar exigindo verificação humana; uma nova execução controlada só deve ocorrer após mudança legítima do estado externo, sem qualquer mecanismo de contorno.
