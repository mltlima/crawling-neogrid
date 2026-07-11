# ADR 0002: Pipeline offline de entrada

- Status: aceito
- Data: 2026-07-10

## Contexto

O case aceita quatro formatos, mas validação, análise de duplicidades e agrupamento não podem depender da tecnologia usada para ler o arquivo. Registros ruins não devem impedir o diagnóstico do restante do lote.

## Decisão

Cada adapter implementa `InputReader` e converte sua origem em `InputBatch`. O caso de uso seleciona o reader pela extensão, valida cada URL sem rede e conserva válidos e inválidos. URLs válidas são normalizadas de forma determinística, preservando também o texto original.

UUIDs de merchant e item seguem a forma canônica RFC 4122. Duplicidades são contadas como ocorrências além da primeira e acompanhadas pelos índices zero-based de origem. O agrupamento por `merchantId` mantém todos os registros, inclusive duplicados.

O contrato futuro de produto é strict e possui exatamente sete campos. A Etapa 2 não instancia produtos nem escreve arquivos de saída.

## Consequências

- Novos formatos podem ser adicionados sem alterar a validação.
- Resultados são determinísticos e testáveis sem Playwright ou HTTP.
- O resumo distingue volume inválido, vazio e duplicado sem perda de rastreabilidade.
- ExcelJS recebe override transitivo de `uuid` para uma versão corrigida; testes XLSX protegem essa compatibilidade.
