import { useMemo } from "react";
import { Link } from "wouter";
import { FileText, CalendarClock, AlertTriangle, Wallet, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

function formatCurrency(value: unknown) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export default function PostAwardContractsCenter() {
  const dashboardQuery = trpc.postAwardContracts.dashboard.useQuery();
  const listQuery = trpc.postAwardContracts.list.useQuery({});

  const dashboard = dashboardQuery.data;
  const contracts = listQuery.data ?? [];

  const summaryCards = useMemo(
    () => [
      {
        title: "Contratos totais",
        value: String(dashboard?.totalContratos ?? 0),
        helper: "Base consolidada de contratos pós-licitação",
        icon: FileText,
      },
      {
        title: "Contratos ativos",
        value: String(dashboard?.contratosAtivos ?? 0),
        helper: "Em execução, saldo e alertas monitorados",
        icon: CalendarClock,
      },
      {
        title: "Saldo total monitorado",
        value: formatCurrency(dashboard?.saldoTotal),
        helper: "Saldo remanescente informado no módulo",
        icon: Wallet,
      },
      {
        title: "Próximos vencimentos",
        value: String(dashboard?.proximosVencimentos?.length ?? 0),
        helper: "Contratos com vencimento próximo ou demandando ação",
        icon: AlertTriangle,
      },
    ],
    [dashboard],
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="container py-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Contratos Pós-Licitação</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Gestão contratual após adjudicação e ata</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Painel executivo para acompanhar contratos, saldo, vencimentos e prioridades operacionais derivadas das propostas e adjudicações.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/decisao-executiva" className="inline-flex items-center gap-2 border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                Assistente Executivo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/propostas-admin" className="inline-flex items-center gap-2 bg-[#1A3F8F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#15357A]">
                Voltar para Administração
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8 space-y-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="rounded-none border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{card.title}</p>
                    <p className="mt-3 text-2xl font-bold text-slate-900">{card.value}</p>
                    <p className="mt-2 text-sm text-slate-600">{card.helper}</p>
                  </div>
                  <div className="bg-blue-50 p-3 text-[#1A3F8F]">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-none border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Carteira de contratos</h2>
              <p className="mt-1 text-sm text-slate-600">Listagem operacional dos contratos já cadastrados no módulo pós-licitação.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Contrato</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Valor Global</th>
                    <th className="px-6 py-3">Saldo</th>
                    <th className="px-6 py-3">Vigência Final</th>
                  </tr>
                </thead>
                <tbody>
                  {listQuery.isLoading ? (
                    <tr>
                      <td className="px-6 py-8 text-slate-500" colSpan={5}>Carregando contratos...</td>
                    </tr>
                  ) : contracts.length === 0 ? (
                    <tr>
                      <td className="px-6 py-8 text-slate-500" colSpan={5}>Nenhum contrato pós-licitação cadastrado até o momento.</td>
                    </tr>
                  ) : (
                    contracts.map((contract: any) => (
                      <tr key={contract.id} className="border-t border-slate-100">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{contract.contractNumber ?? `Contrato #${contract.id}`}</div>
                          <div className="text-xs text-slate-500">{contract.supplierName ?? contract.notes ?? "Sem observação resumida"}</div>
                        </td>
                        <td className="px-6 py-4 capitalize text-slate-700">{contract.status ?? "draft"}</td>
                        <td className="px-6 py-4 text-slate-700">{formatCurrency(contract.globalValue ?? contract.valueGlobal)}</td>
                        <td className="px-6 py-4 text-slate-700">{formatCurrency(contract.balanceValue ?? contract.currentBalance)}</td>
                        <td className="px-6 py-4 text-slate-700">{formatDate(contract.endDate ?? contract.contractEndDate)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-none border border-amber-200 bg-amber-50 p-6">
              <h2 className="text-lg font-semibold text-amber-900">Próximas ações recomendadas</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-amber-900">
                <li>Validar rotinas de saldo, reajuste e prorrogação diretamente com a equipe operacional.</li>
                <li>Amarrar contratos às propostas vencedoras e aos órgãos relevantes onde essa vinculação existir.</li>
                <li>Adicionar alertas visuais por vencimento, saldo crítico e pendências documentais.</li>
              </ul>
            </div>

            <div className="rounded-none border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Situação técnica</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p>O backend deste módulo já suporta dashboard, listagem, detalhe, criação, atualização, movimentação e reajuste.</p>
                <p>Esta primeira tela consolida a leitura operacional e prepara a fase seguinte de edição assistida e alertas contratuais.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
