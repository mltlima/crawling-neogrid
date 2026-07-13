# Security

Reporte vulnerabilidades de forma privada ao mantenedor do repositório. Não inclua tokens, cookies ou dados de sessão.

O projeto não usa credenciais, stealth, proxies ou resolução de CAPTCHA. Logs removem query strings e tokens e limitam mensagens. Trace é desabilitado por padrão, pode conter dados temporários de sessão e não deve ser versionado ou entregue sem revisão. CI executa CodeQL, secret scanning, Trivy e gera SBOM; testes não acessam o iFood.
