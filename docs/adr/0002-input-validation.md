# ADR 0002: Pipeline offline de entrada

- Status: aceito
- Data: 2026-07-10

## Contexto

O case aceita quatro formatos, mas validação, análise de duplicidades e agrupamento não podem depender da tecnologia usada para ler o arquivo. Registros ruins não devem impedir o diagnóstico do restante do lote.

## Decisão

Cada adapter implementa `InputReader` e converte sua origem em `InputBatch`. O caso de uso seleciona o reader pela extensão, valida cada URL sem rede e conserva válidos e inválidos. URLs válidas são normalizadas de forma determinística, preservando também o texto original.

UUIDs de merchant e item seguem a forma canônica RFC 4122. Duplicidades são contadas como ocorrências além da primeira e acompanhadas pelos índices zero-based de origem. O agrupamento por `merchantId` mantém todos os registros, inclusive duplicados.

O contrato de produto é strict e possui exatamente sete campos. A validação de entrada não instancia produtos nem escreve arquivos de produtos.

O resumo inclui dimensões únicas, distribuições por merchant/localidade, erros por código e duração. A CLI pode persistir o relatório completo via `ValidationReportWriter`, sem acoplar o caso de uso ao filesystem. Exit code 2 representa um lote concluído com rejeições; exit code 1 fica reservado a falhas operacionais.

## Consequências

- Novos formatos podem ser adicionados sem alterar a validação.
- Resultados são determinísticos e testáveis sem Playwright ou HTTP.
- O resumo distingue volume inválido, vazio e duplicado sem perda de rastreabilidade.
- Automação pode distinguir sucesso total, rejeições de dados e falhas operacionais pelos códigos 0, 2 e 1.
- `--report` adiciona um artefato completo sem alterar o resumo JSON emitido no terminal.
- ExcelJS recebe override transitivo de `uuid` para uma versão corrigida; testes XLSX protegem essa compatibilidade.
