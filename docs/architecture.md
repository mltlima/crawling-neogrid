# Arquitetura

O sistema é uma CLI batch em camadas. `domain` mantém schemas strict; `application` contém casos de uso e portas; `adapters/input` lê formatos; `adapters/crawler/ifood` extrai; `adapters/output` exporta e verifica; `infrastructure` gerencia Playwright, checkpoint e arquivos; `observability` produz logs sanitizados.

O fluxo valida e ordena entradas, limita a seleção, recupera resultados confirmados, distribui itens em worker pool limitado e aplica pacing global. Cada item usa contexto/página isolados. Respostas de rede só têm corpo lido quando tipo, URL e tamanho são candidatos. A extração exige `itemId` exato e segue network, dados embutidos e DOM.

Retries seletivos usam backoff, teto e jitter. Bloqueio, redirecionamento, localização e indisponibilidade são terminais. Circuit breaker interrompe novas retiradas quando falhas sistêmicas consecutivas atingem o limite. Browser desconectado é recuperado por geração compartilhada.

Checkpoint contém manifesto, journal JSONL de resultados, journal de eventos e lock exclusivo. O lock é adquirido antes da criação/modificação; resume valida hash, limite, seleção e identidade dos resultados. Linha final truncada pode ser reparada; corrupção interna é rejeitada. Escritas confirmadas são sincronizadas e arquivos finais só são exportados após seleção completa.

JSONL e CSV preservam ordem e duplicidades. O manifest registra runId, hash da entrada, hashes/tamanhos e resumo. `OutputVerifier` relê ambos, aplica o schema de sete campos e recusa divergências antes da entrega.

Docker multi-stage separa build/runtime, usa imagem oficial Playwright e `pwuser`. Compose monta entrada read-only e saídas graváveis. CI separa qualidade, Docker, CodeQL e supply chain, sem chamadas live.

Credenciais, stealth, CAPTCHA solver, proxy rotation e endpoints privados estão fora do desenho.
