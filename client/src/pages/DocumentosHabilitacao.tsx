import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const initialForm = {
  tipo: "",
  nome: "",
  dataEmissao: "",
  dataVencimento: "",
  statusValidade: "sem_data" as "valido" | "expirando" | "vencido" | "sem_data",
  orgaoEmissor: "",
  notas: "",
};

export default function DocumentosHabilitacaoPage() {
  const [form, setForm] = useState(initialForm);
  const docs = trpc.documents.list.useQuery();
  const summary = trpc.documents.summary.useQuery();
  const save = trpc.documents.upsert.useMutation({ onSuccess: () => { toast.success("Documento salvo"); docs.refetch(); summary.refetch(); setForm(initialForm); } });
  const remove = trpc.documents.remove.useMutation({ onSuccess: () => { toast.success("Documento removido"); docs.refetch(); summary.refetch(); } });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documentos de Habilitação</h1>
        <p className="text-muted-foreground mt-2">Controle de validade, órgão emissor e observações documentais.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Total", summary.data?.total ?? 0],
          ["Válidos", summary.data?.validos ?? 0],
          ["Expirando", summary.data?.expirando ?? 0],
          ["Vencidos", summary.data?.vencidos ?? 0],
        ].map(([title, value]) => (
          <Card key={String(title)}><CardContent className="p-6"><div className="text-sm text-muted-foreground">{title}</div><div className="text-3xl font-bold">{value}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Novo documento</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} />
          <Input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <Input placeholder="Data de emissão" value={form.dataEmissao} onChange={(e) => setForm({ ...form, dataEmissao: e.target.value })} />
          <Input placeholder="Data de vencimento" value={form.dataVencimento} onChange={(e) => setForm({ ...form, dataVencimento: e.target.value })} />
          <Input placeholder="Órgão emissor" value={form.orgaoEmissor} onChange={(e) => setForm({ ...form, orgaoEmissor: e.target.value })} />
          <select className="h-10 rounded-md border px-3" value={form.statusValidade} onChange={(e) => setForm({ ...form, statusValidade: e.target.value as any })}>
            <option value="sem_data">Sem data</option>
            <option value="valido">Válido</option>
            <option value="expirando">Expirando</option>
            <option value="vencido">Vencido</option>
          </select>
          <textarea className="min-h-24 rounded-md border px-3 py-2 md:col-span-2" placeholder="Notas" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          <Button className="md:col-span-2" onClick={() => save.mutate(form)}>Salvar documento</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Documentos cadastrados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {docs.data?.map((doc) => (
            <div key={doc.id} className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold">{doc.nome}</div>
                <div className="text-sm text-muted-foreground">{doc.tipo} · {doc.statusValidade}{doc.dataVencimento ? ` · venc. ${doc.dataVencimento}` : ""}</div>
                {doc.orgaoEmissor ? <div className="text-sm text-muted-foreground">{doc.orgaoEmissor}</div> : null}
              </div>
              <Button variant="outline" onClick={() => remove.mutate({ id: doc.id })}>Remover</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
