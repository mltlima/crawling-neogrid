# Performance

`npm run benchmark:offline` simula deterministicamente 1.000 itens sem rede, com concorrência configurada por `BENCHMARK_CONCURRENCY`. Mede duração, throughput, tentativas, retries, heap aproximado, sucessos, falhas, ordenação e quantidade de workers/promises. O resultado inclui hardware, Node e sistema operacional em `evidence/performance/offline-benchmark.json`.

O benchmark demonstra limitação de promessas ao número de workers e não representa latência real do iFood, Chromium ou internet.

Última execução local: Windows 10.0.19045, Node 20.11.0, 16 CPUs lógicas e aproximadamente 34 GB de RAM; 1.000 registros, concorrência 4, 1.050 tentativas, 50 retries, 900 sucessos simulados, 100 falhas simuladas, ordem preservada e quatro promises de worker. O benchmark retomou 500 registros de um journal local, processou os 500 restantes sem reprocessar confirmados e preservou nove duplicidades simuladas. A duração de aproximadamente 42 ms reflete somente filesystem local e adapter falso; não deve ser usada como previsão live.
