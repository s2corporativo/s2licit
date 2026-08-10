import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, Loader2, PlugZap, Plus, ShieldCheck } from "lucide-react";

type FormState = {
  supplierId: string;
  scraperType: string;
  email: string;
  password: string;
  scheduleTime: string;
  loginUrl: string;
  searchUrlTemplate: string;
  categoryUrls: string;
  loginEmail: string;
  loginPassword: string;
  loginSubmit: string;
  loginSuccessSelector: string;
  productItem: string;
  productName: string;
  productPrice: string;
  productCode: string;
  productEan: string;
  productImage: string;
  productLink: string;
  nextPage: string;
  waitForSelector: string;
};

const INITIAL: FormState = {
  supplierId: "",
  scraperType: "personalizado",
  email: "",
  password: "",
  scheduleTime: "02:00",
  loginUrl: "",
  searchUrlTemplate: "",
  categoryUrls: "",
  loginEmail: "input[type='email'], input[name='email'], input[name='username']",
  loginPassword: "input[type='password']",
  loginSubmit: "button[type='submit'], input[type='submit']",
  loginSuccessSelector: "",
  productItem: ".product, .produto, [class*='product'], [class*='item']",
  productName: "h2, h3, .name, .title, .nome, .titulo",
  productPrice: ".price, .preco, [class*='price'], [class*='preco']",
  productCode: "",
  productEan: "",
  productImage: "img",
  productLink: "a",
  nextPage: "[rel='next'], .next, .proxima",
  waitForSelector: "",
};

function slug(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function CaptureConnectorWizard({ onSaved }: { onSaved?: () => void }) {
  const utils = trpc.useUtils();
  const { data: suppliers = [] } = trpc.suppliers.list.useQuery();
  const { data: presets = [] } = trpc.scraperAgent.tiposDisponiveis.useQuery();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [custom, setCustom] = useState(false);
  const [tos, setTos] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((item: any) => String(item.id) === form.supplierId),
    [suppliers, form.supplierId],
  );
  const scraperType = custom ? slug(selectedSupplier?.name || form.scraperType) || "personalizado" : form.scraperType;

  const buildSelectors = () => {
    const categoryUrls = form.categoryUrls.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!categoryUrls.length && !form.searchUrlTemplate.trim()) {
      throw new Error("Informe páginas de catálogo OU uma URL de busca com {q}.");
    }
    const selectors: Record<string, unknown> = {
      categoryUrls,
      loginEmail: form.loginEmail.trim(),
      loginPassword: form.loginPassword.trim(),
      loginSubmit: form.loginSubmit.trim(),
      productItem: form.productItem.trim(),
      productName: form.productName.trim(),
      productPrice: form.productPrice.trim(),
    };
    for (const key of [
      "loginUrl", "searchUrlTemplate", "loginSuccessSelector", "productCode", "productEan",
      "productImage", "productLink", "nextPage", "waitForSelector",
    ] as const) {
      const value = form[key].trim();
      if (value) selectors[key] = value;
    }
    return selectors;
  };

  const test = trpc.scraperAgent.testarConexao.useMutation({
    onSuccess: (result) => {
      setTestResult(result);
      result.success ? toast.success(result.message) : toast.error(result.message);
    },
    onError: (error) => toast.error(error.message),
  });

  const save = trpc.scraperAgent.cadastrar.useMutation({
    onSuccess: async () => {
      toast.success("Conector configurado e pronto para o Capture Core.");
      await Promise.all([
        utils.scraperAgent.listar.invalidate(),
        utils.captureCore.health.invalidate(),
      ]);
      setForm(INITIAL);
      setTos(false);
      setTestResult(null);
      onSaved?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const validateBase = () => {
    if (!form.supplierId || !form.email || form.password.length < 4) {
      throw new Error("Selecione o fornecedor e informe login/senha.");
    }
  };

  const handleTest = () => {
    try {
      validateBase();
      setTestResult(null);
      if (custom) {
        test.mutate({
          scraperType,
          email: form.email,
          password: form.password,
          customSelectors: buildSelectors() as any,
        });
      } else {
        test.mutate({ scraperType, email: form.email, password: form.password });
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleSave = () => {
    try {
      validateBase();
      if (!tos) throw new Error("Confirme a revisão dos termos de uso antes de ativar a captura.");
      save.mutate({
        supplierId: Number(form.supplierId),
        scraperType,
        email: form.email,
        password: form.password,
        scheduleTime: form.scheduleTime,
        tosAprovado: true,
        ...(custom ? { customSelectors: buildSelectors() as any } : {}),
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-blue-700" />
        <h2 className="font-bold text-slate-900">Adicionar conector</h2>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Use um modelo homologado ou configure um portal próprio. Conectores somente de busca podem usar apenas a URL com <code>{"{q}"}</code>; catálogo completo exige ao menos uma página de categoria.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">
          Fornecedor
          <select
            value={form.supplierId}
            onChange={(event) => {
              const supplierId = event.target.value;
              const supplier = suppliers.find((item: any) => String(item.id) === supplierId);
              const normalized = supplier ? slug(supplier.name).replace(/-/g, "") : "";
              const preset = presets.find((item: any) => item.tipo.replace(/-/g, "") === normalized);
              setCustom(!preset);
              setForm((state) => ({ ...state, supplierId, scraperType: preset?.tipo || "personalizado" }));
            }}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {suppliers.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Estratégia
          <select
            value={custom ? "custom" : form.scraperType}
            onChange={(event) => {
              if (event.target.value === "custom") setCustom(true);
              else {
                setCustom(false);
                setForm((state) => ({ ...state, scraperType: event.target.value }));
              }
            }}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {presets.map((item: any) => <option key={item.tipo} value={item.tipo}>{item.tipo}</option>)}
            <option value="custom">Personalizado</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Login/e-mail
          <input type="email" value={form.email} onChange={(event) => setForm((state) => ({ ...state, email: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Senha
          <div className="relative mt-1">
            <input type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm((state) => ({ ...state, password: event.target.value }))} className="block w-full rounded-lg border border-slate-200 px-3 py-2 pr-9 text-sm" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Horário automático
          <input type="time" value={form.scheduleTime} onChange={(event) => setForm((state) => ({ ...state, scheduleTime: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
      </div>

      {custom && (
        <div className="mt-5 space-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="URL de login" value={form.loginUrl} onChange={(value) => setForm((state) => ({ ...state, loginUrl: value }))} />
            <Field label="URL de busca — use {q}" value={form.searchUrlTemplate} onChange={(value) => setForm((state) => ({ ...state, searchUrlTemplate: value }))} placeholder="https://site.com/busca?q={q}" />
          </div>
          <label className="block text-xs font-semibold text-slate-600">
            Páginas de catálogo — uma por linha (opcional se houver URL de busca)
            <textarea value={form.categoryUrls} onChange={(event) => setForm((state) => ({ ...state, categoryUrls: event.target.value }))} rows={3} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Seletor login" value={form.loginEmail} onChange={(value) => setForm((state) => ({ ...state, loginEmail: value }))} />
            <Field label="Seletor senha" value={form.loginPassword} onChange={(value) => setForm((state) => ({ ...state, loginPassword: value }))} />
            <Field label="Seletor entrar" value={form.loginSubmit} onChange={(value) => setForm((state) => ({ ...state, loginSubmit: value }))} />
            <Field label="Sinal de login concluído" value={form.loginSuccessSelector} onChange={(value) => setForm((state) => ({ ...state, loginSuccessSelector: value }))} />
            <Field label="Card do produto" value={form.productItem} onChange={(value) => setForm((state) => ({ ...state, productItem: value }))} />
            <Field label="Nome" value={form.productName} onChange={(value) => setForm((state) => ({ ...state, productName: value }))} />
            <Field label="Preço" value={form.productPrice} onChange={(value) => setForm((state) => ({ ...state, productPrice: value }))} />
            <Field label="SKU/código" value={form.productCode} onChange={(value) => setForm((state) => ({ ...state, productCode: value }))} />
            <Field label="EAN" value={form.productEan} onChange={(value) => setForm((state) => ({ ...state, productEan: value }))} />
            <Field label="Imagem" value={form.productImage} onChange={(value) => setForm((state) => ({ ...state, productImage: value }))} />
            <Field label="Link" value={form.productLink} onChange={(value) => setForm((state) => ({ ...state, productLink: value }))} />
            <Field label="Próxima página" value={form.nextPage} onChange={(value) => setForm((state) => ({ ...state, nextPage: value }))} />
            <Field label="Aguardar seletor" value={form.waitForSelector} onChange={(value) => setForm((state) => ({ ...state, waitForSelector: value }))} />
          </div>
        </div>
      )}

      {testResult && (
        <div className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${testResult.success ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {testResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <ShieldCheck className="mt-0.5 h-4 w-4" />}
          {testResult.message}
        </div>
      )}

      <label className="mt-4 flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={tos} onChange={(event) => setTos(event.target.checked)} className="mt-0.5" />
        Confirmo que os termos de uso e a autorização de coleta deste portal foram revisados.
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={handleTest} disabled={test.isPending} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Testar acesso
        </button>
        <button type="button" onClick={handleSave} disabled={save.isPending} className="inline-flex items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-xs font-bold text-white hover:bg-blue-900 disabled:opacity-50">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Salvar conector
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs" />
    </label>
  );
}
