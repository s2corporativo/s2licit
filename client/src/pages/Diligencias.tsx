import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const initialForm = {
  tipo: "diligencia",
  titulo: "",
  status: "aberta" as "aberta" | "pendente" | "respondida" | "encerrada",
  prioridade: "media" as "baixa" | "media" | "alta",
  prazoResposta: "",
  responsavel: "",
  detalhes: "",
  resposta: "",
};

export default function DiligenciasPage() {
  const [form, setForm] = useState(initialForm);
  const list = trpc.workflow.list.useQuery();
  const save = trpc.workflow.upsert.useMutation({ onSuccess: () => { toast.success("Fluxo salvo"); list.refetch(); setForm(initialForm); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.workflow.remove.useMutation({ onSuccess: () => { toast.success("Fluxo removido"); list.refetch(); }, onError: (e) => toast.error(e.message) });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Diligências, impugnações e recursos</h1>
        <p className="text-muted-foreground mt-2">Controle de pendências jurídicas e administrativas vinculadas à operação.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Novo fluxo</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} />
          <Input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <select className="h-10 rounded-md border px-3" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
            <option value="aberta">Aberta</option>
            <option value="pendente">Pendente</option>
            <option value="respondida">Respondida</option>
            <option value="encerrada">Encerrada</option>
          </select>
          <select className="h-10 rounded-md border px-3" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value as any })}>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </select>
          <Input placeholder="Prazo de resposta (YYYY-MM-DD)" value={form.prazoResposta} onChange={(e) => setForm({ ...form, prazoResposta: e.target.value })} />
          <Input placeholder="Responsável" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
          <textarea className="min-h-24 rounded-md border px-3 py-2 md:col-span-2" placeholder="Detalhes" value={form.detalhes} onChange={(e) => setForm({ ...form, detalhes: e.target.value })} />
          <textarea className="min-h-24 rounded-md border px-3 py-2 md:col-span-2" placeholder="Resposta" value={form.resposta} onChange={(e) => setForm({ ...form, resposta: e.target.value })} />
          <Button className="md:col-span-2" onClick={() => save.mutate(form)}>Salvar fluxo</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fluxos cadastrados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {list.data?.map((item) => (
            <div key={item.id} className="rounded-lg border p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold">{item.titulo}</div>
                  <div className="text-sm text-muted-foreground">{item.tipo} · {item.status} · prioridade {item.prioridade}{item.prazoResposta ? ` · prazo ${String(item.prazoResposta)}` : ""}</div>
                  {item.detalhes ? <div className="mt-2 text-sm">{item.detalhes}</div> : null}
                </div>
                <Button variant="outline" onClick={() => remove.mutate({ id: item.id })}>Remover</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
