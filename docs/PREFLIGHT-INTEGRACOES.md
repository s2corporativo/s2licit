# Preflight autônomo de integrações

O S2 pode validar a Integration Platform sem depender do GitHub Actions:

```bash
bash scripts/preflight-integration-platform.sh
```

Para incluir contratos públicos ao vivo:

```bash
RUN_PUBLIC_SMOKE=1 bash scripts/preflight-integration-platform.sh
```

O preflight executa guardas arquiteturais, typecheck, testes e build. O smoke adicional valida PNCP e Compras.gov em rede e deve ser executado em homologação/VPS com saída de internet.
