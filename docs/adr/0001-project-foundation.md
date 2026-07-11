# ADR 0001: Fundação do projeto

- Status: aceito
- Data: 2026-07-10

## Contexto

O crawler precisa ser reproduzível, executado em lote e preparado para automação de browser, sem misturar regras de negócio com I/O ou introduzir coleta na primeira etapa.

## Decisão

Adotar Node.js LTS, npm com lockfile, TypeScript em modo strict e módulos ESM. A CLI usa Commander; a configuração usa dotenv e Zod; logs estruturados usam Pino; a futura automação usará Playwright. ESLint, Prettier, Vitest e cobertura V8 formam a barreira de qualidade local e do GitHub Actions.

O container de runtime usa a imagem oficial do Playwright com a mesma versão instalada no projeto. A arquitetura separa domínio/aplicação de adapters e infraestrutura.

## Consequências

- Instalações com `npm ci` são reproduzíveis pelo lockfile.
- Configuração inválida falha cedo e com diagnóstico estruturado pelo Zod.
- Testes da fundação são rápidos, determinísticos e totalmente offline.
- Playwright aumenta o tamanho das dependências e da imagem, mas evita preparar browsers e bibliotecas de sistema manualmente em fases futuras.
- O contrato de sete campos será definido em uma fase de domínio/output, antes de qualquer persistência real.
