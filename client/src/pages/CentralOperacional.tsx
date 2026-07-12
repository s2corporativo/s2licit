import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertCircle, Search, ShieldCheck, FileWarning, Scale, Calculator } from "lucide-react";

const money = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));

export default function CentralOperacional() {
  const [search, setSearch] = useState("");
  const [pricing, setPricing] = useState({
    cost: 100,
    icmsPercent: 0,
    ipiPercent: 0,
    pisPercent: 0,
    cofinsPercent: 0,
    freight: 0,
    overhead: 0,
    marginPercent: 20,
    editalRefPrice: 0,
  });

  const actionCenter = trpc.operations.getActionCenter.useQuery();
  const searchQuery = trpc.operations.universalSearch.useQuery(
    { query: search },
    { enabled: search.trim().length >= 2 }
  );
  const pricingQuery = trpc.operations.calculateStrategicPrice.useQuery(pricing);

  const cards = useMemo(() => {
    const data = actionCenter.data;
    if (!data) return [];
    return [
      { title: "Documentos com alerta", value: data.expiringDocs.length, icon: FileWarning },
      { title: "Diligências abertas", value: data.openDiligences.length, icon: AlertCircle },
      { title: "Propostas em rascunho", value: data.draftProposals.length, icon: ShieldCheck },
      { title: "Propostas com risco", value: (data.riskyProposals as any[])?.length ?? 0, icon: Scale },
    ];
  }, [actionCenter.data]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Central Operacional</h1>
        <p className="text-muted-foreground mt-2">
          Painel diário com busca universal, alertas operacionais e formação estratégica de preço.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-3xl font-bold">{card.value}</p>
                </div>
                <Icon className="h-6 w-6 text-muted-foreground" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Busca universal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar produto, EAN, fornecedor, proposta, órgão ou documento" />
            {searchQuery.data && (
              <div className="grid gap-4 md:grid-cols-2">
                <ResultBox title="Produtos" rows={searchQuery.data.products.map((p) => `${p.name}${p.ean ? ` · EAN ${p.ean}` : ""}`)} />
                <ResultBox title="Fornecedores" rows={searchQuery.data.suppliers.map((s) => s.name)} />
                <ResultBox title="Propostas" rows={searchQuery.data.proposals.map((p) => `${p.title ?? "Sem título"}${p.processNumber ? ` · ${p.processNumber}` : ""}`)} />
                <ResultBox title="Órgãos / documentos" rows={[...searchQuery.data.orgs.map((o) => `${o.name}${o.cnpj ? ` · ${o.cnpj}` : ""}`), ...searchQuery.data.documents.map((d) => `${d.nome} · ${d.tipo}`)]} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Formação estratégica de preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(pricing).map(([key, value]) => (
                <label key={key} className="text-sm">
                  <span className="mb-1 block text-muted-foreground">{labelMap[key as keyof typeof pricing]}</span>
                  <Input type="number" step="0.01" value={value} onChange={(e) => setPricing((prev) => ({ ...prev, [key]: Number(e.target.value) }))} />
                </label>
              ))}
            </div>
            {pricingQuery.data && (
              <div className="rounded-lg border p-4 text-sm space-y-2">
                <div className="flex justify-between"><span>Base com encargos</span><strong>{money(pricingQuery.data.baseWithCharges)}</strong></div>
                <div className="flex justify-between"><span>Margem estimada</span><strong>{money(pricingQuery.data.marginValue)}</strong></div>
                <div className="flex justify-between text-base"><span>Preço sugerido</span><strong>{money(pricingQuery.data.suggestedPrice)}</strong></div>
                <div className="flex justify-between"><span>Abaixo do referencial do edital</span><strong>{pricingQuery.data.belowReference === null ? "N/D" : pricingQuery.data.belowReference ? "Sim" : "Não"}</strong></div>
                <div className="flex justify-between"><span>Alerta de inexequibilidade</span><strong>{pricingQuery.data.inexequivel ? "Sim" : "Não"}</strong></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SimpleListCard
          title="Documentos críticos"
          rows={actionCenter.data?.expiringDocs?.map((d) => `${d.nome} · ${d.statusValidade}${d.dataVencimento ? ` · venc. ${d.dataVencimento}` : ""}`) ?? []}
        />
        <SimpleListCard
          title="Diligências pendentes"
          rows={actionCenter.data?.openDiligences?.map((d) => `${d.titulo} · ${d.status}${d.prazoResposta ? ` · prazo ${String(d.prazoResposta)}` : ""}`) ?? []}
        />
      </div>
    </div>
  );
}

function ResultBox({ title, rows }: { title: string; rows: string[] }) {
  return <SimpleListCard title={title} rows={rows} compact />;
}

function SimpleListCard({ title, rows, compact = false }: { title: string; rows: string[]; compact?: boolean }) {
  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          {rows.length ? rows.map((row, idx) => <div key={`${title}-${idx}`} className="rounded-md border p-2">{row}</div>) : <div className="text-muted-foreground">Sem registros no momento.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

const labelMap = {
  cost: "Custo",
  icmsPercent: "ICMS %",
  ipiPercent: "IPI %",
  pisPercent: "PIS %",
  cofinsPercent: "COFINS %",
  freight: "Frete",
  overhead: "Desp. indiretas",
  marginPercent: "Margem %",
  editalRefPrice: "Preço ref. edital",
};
