#!/usr/bin/env python3
"""Coletor de licitações via browser-use (github.com/browser-use/browser-use, MIT).

FALLBACK — só deve rodar para portais sem API/dados abertos (hierarquia de
coleta obrigatória: 1º PNCP/API oficial, 2º Compras.gov/dados abertos, 3º
este script, só quando 1 e 2 não cobrirem o portal — decisão tomada no
registro do alvo, não neste script).

CONTRATO com o wrapper TypeScript (server/connectors/browserUseConnector.ts):
  entrada:  argv[1] = JSON com {url, agentTask, maxCostUsd, requiredFields}
  saída:    UMA linha JSON em stdout, sempre — mesmo em erro:
            {"results": [...], "pagesVisited": N, "estimatedCostUsd": X,
             "error": null | "mensagem"}
            stderr é só para log humano (nunca parseado pelo TS).

GUARDAS que este script observa (o resto — legalidade, teto de custo POR
EXECUÇÃO decidido antes de chamar, timeout — são responsabilidade do
wrapper TS, que já checou o registro de conformidade antes de invocar):
  - EDUCAÇÃO: identifica o agente, evita paralelismo (uma navegação de cada
    vez — comportamento padrão do Agent do browser-use).
  - CUSTO: max_actions_per_step baixo e use_vision=False (nunca manda
    screenshot pro LLM — maior fonte de custo por passo) para manter o
    custo estimado abaixo do teto informado; a biblioteca não expõe um
    "orçamento em dólares" nativo verificado por este autor, então o
    controle real de custo é o teto de PASSOS (derivado de maxCostUsd por
    uma estimativa conservadora) — ver `_passos_maximos_por_orcamento`.

NÃO TESTADO PONTA A PONTA (honestidade de engenharia, mesmo padrão de
fiemgConnector.ts): rodar isto contra um navegador e LLM reais exige
ANTHROPIC_API_KEY válida e Chromium instalado — nenhum dos dois está
disponível no ambiente onde este código foi escrito. A API do browser-use
usada aqui (Agent, ChatAnthropic, output_model_schema,
history.structured_output) foi confirmada contra a documentação oficial
atual (docs.browser-use.com) no momento da escrita, não contra execução
real. Precisa de UMA passada de calibração antes de habilitar um alvo de
verdade — mesma ressalva que fiemgConnector.ts já registra para HTML.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

# Estimativa conservadora — não confirmada contra billing real da Anthropic
# nesta integração específica. "A VERIFICAR" antes de confiar no teto.
_CUSTO_ESTIMADO_POR_PASSO_USD = 0.05


def _passos_maximos_por_orcamento(max_cost_usd: float) -> int:
    if max_cost_usd <= 0:
        return 0
    passos = int(max_cost_usd / _CUSTO_ESTIMADO_POR_PASSO_USD)
    return max(1, min(passos, 40))  # teto absoluto — nunca deixa rodar solto


class ResultadoLicitacao:
    """Espelha (subconjunto) de NormalizedLicitacao — o wrapper TS completa
    os campos que este script não tem como saber (source, dedupeKey)."""


def _saida(resultados: list[dict[str, Any]], pages: int, custo: float, erro: str | None) -> None:
    print(json.dumps({
        "results": resultados,
        "pagesVisited": pages,
        "estimatedCostUsd": round(custo, 4),
        "error": erro,
    }, ensure_ascii=False))


def main() -> int:
    if len(sys.argv) < 2:
        _saida([], 0, 0.0, "argv[1] (config JSON) ausente")
        return 1

    try:
        config = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        _saida([], 0, 0.0, f"config JSON inválida: {e}")
        return 1

    url = config.get("url")
    agent_task = config.get("agentTask")
    max_cost_usd = float(config.get("maxCostUsd") or 0)
    required_fields = config.get("requiredFields") or []

    if not url or not agent_task:
        _saida([], 0, 0.0, "url/agentTask ausentes na config")
        return 1

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        _saida([], 0, 0.0, "ANTHROPIC_API_KEY ausente — coleta não pode rodar sem LLM configurado")
        return 1

    max_steps = _passos_maximos_por_orcamento(max_cost_usd)
    if max_steps == 0:
        _saida([], 0, 0.0, "maxCostUsd <= 0 — nenhum passo permitido")
        return 1

    try:
        import asyncio

        from browser_use import Agent, ChatAnthropic
        from pydantic import BaseModel, Field, create_model

        # Schema dinâmico: um item por licitação encontrada, com os campos
        # que o registro do alvo exige (fragilidade — não aceita resultado
        # sem os campos mínimos, ver PASSO 3c do escopo).
        campos = {campo: (str, Field(default="")) for campo in required_fields} or {
            "objeto": (str, Field(default="")),
        }
        ItemLicitacao = create_model("ItemLicitacao", **campos)  # type: ignore[call-overload]

        class Extracao(BaseModel):
            itens: list[ItemLicitacao] = Field(default_factory=list)  # type: ignore[valid-type]

        async def _rodar() -> Extracao:
            llm = ChatAnthropic(
                model=os.environ.get("BROWSER_USE_LLM_MODEL", "claude-sonnet-5"),
                api_key=api_key,
            )
            agent = Agent(
                task=(
                    f"Navegue até {url}. {agent_task} "
                    f"Extraia SOMENTE o que estiver realmente na página — nunca "
                    f"invente valor para um campo que não encontrar; deixe vazio."
                ),
                llm=llm,
                output_model_schema=Extracao,
                use_vision=False,  # maior fonte de custo por passo — desligado
                max_actions_per_step=2,
            )
            history = await agent.run(max_steps=max_steps)
            saida_estruturada = getattr(history, "structured_output", None)
            if saida_estruturada is None:
                # Fallback defensivo — versão da lib pode expor de outro jeito.
                bruto = history.final_result() if hasattr(history, "final_result") else None
                if bruto:
                    saida_estruturada = Extracao.model_validate_json(bruto)
            return saida_estruturada or Extracao()

        extracao = asyncio.run(_rodar())
        resultados = [item.model_dump() for item in extracao.itens]
        custo_estimado = min(max_steps, len(resultados) or 1) * _CUSTO_ESTIMADO_POR_PASSO_USD
        _saida(resultados, max_steps, custo_estimado, None)
        return 0

    except ImportError as e:
        _saida([], 0, 0.0, f"dependência ausente (pip install -r requirements.txt): {e}")
        return 1
    except Exception as e:  # noqa: BLE001 — contrato exige stdout sempre parseável
        _saida([], 0, 0.0, f"falha na coleta: {type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
