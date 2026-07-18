import { trpc } from "@/lib/trpc";
import { Building2, Save, Upload, X, ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePermission } from "@/components/RequireAuth";
import { EmailConfigSection } from "@/components/EmailConfigSection";

// ─── Logo Uploader Component ──────────────────────────────────────────────────
function LogoUploader({
  currentUrl,
  onUploaded,
  onClear,
}: {
  currentUrl: string;
  onUploaded: (url: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (PNG, JPG, SVG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 5 MB");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch("/api/upload/logo", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      onUploaded(url);
      toast.success("Logo enviado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao enviar logo: " + (err.message ?? "tente novamente"));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-2">
        Logo da Empresa
      </label>

      {currentUrl ? (
        <div className="flex items-center gap-4 p-4 border border-gray-200 bg-gray-50">
          <img
            src={currentUrl}
            alt="Logo da empresa"
            className="h-16 w-auto max-w-[160px] object-contain border border-gray-200 bg-white p-1"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-700 mb-0.5">Logo atual</div>
            <div className="text-[10px] text-gray-400 truncate">{currentUrl}</div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-gray-300 text-gray-600 hover:border-gray-900 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                <Upload size={10} />
                {uploading ? "Enviando..." : "Trocar"}
              </button>
              <button
                type="button"
                onClick={onClear}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-blue-200 text-blue-700 hover:border-blue-800 hover:text-blue-800 transition-colors"
              >
                <X size={10} />
                Remover
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Enviando logo...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ImageIcon size={28} className="text-gray-300" />
              <div className="text-sm font-semibold text-gray-600">
                Clique ou arraste o logo aqui
              </div>
              <div className="text-[10px] text-gray-400">
                PNG, JPG, SVG ou WebP — máx. 5 MB
              </div>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <div className="text-[10px] text-gray-400 mt-1">
        O logo aparece no cabeçalho de todos os PDFs de propostas gerados
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ConfiguracaoEmpresa() {
  const { data, isLoading } = trpc.company.get.useQuery();
  const utils = trpc.useUtils();
  const isAdmin = usePermission("admin");

  const [form, setForm] = useState({
    name: "",
    cnpj: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    email: "",
    website: "",
    logoUrl: "",
    bankInfo: "",
    notes: "",
    minMarginPercent: "15",
  });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? "",
        cnpj: data.cnpj ?? "",
        address: data.address ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        zipCode: data.zipCode ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        website: data.website ?? "",
        logoUrl: data.logoUrl ?? "",
        bankInfo: data.bankInfo ?? "",
        notes: data.notes ?? "",
        minMarginPercent: data.minMarginPercent != null ? String(data.minMarginPercent) : "15",
      });
    }
  }, [data]);

  const upsert = trpc.company.upsert.useMutation({
    onSuccess: () => {
      utils.company.get.invalidate();
      toast.success("Configurações salvas com sucesso!");
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsert.mutate({
      name: form.name || undefined,
      cnpj: form.cnpj || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      zipCode: form.zipCode || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      logoUrl: form.logoUrl || null,
      bankInfo: form.bankInfo || null,
      notes: form.notes || null,
      minMarginPercent: form.minMarginPercent ? parseFloat(form.minMarginPercent) : null,
    });
  };

  const Field = ({
    label,
    field,
    type = "text",
    placeholder,
    wide,
    hint,
  }: {
    label: string;
    field: string;
    type?: string;
    placeholder?: string;
    wide?: boolean;
    hint?: string;
  }) => (
    <div className={wide ? "col-span-2" : ""}>
      <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
        {label}
      </label>
      <input
        type={type}
        value={(form as any)[field]}
        onChange={(e) => set(field, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 transition-colors"
      />
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <span className="its-bar" />
        <h1 className="text-3xl font-black tracking-tight text-gray-900">
          Configurações da Empresa
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Dados que aparecem no cabeçalho das propostas comerciais
        </p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center">
          <div className="w-6 h-1 bg-blue-800 mx-auto mb-3 animate-pulse" />
          <p className="text-xs text-gray-400 tracking-widest uppercase">Carregando...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            {/* Identificação */}
            <div className="col-span-2">
              <div className="its-rule mb-1" />
              <div className="flex items-center gap-2">
                <Building2 size={12} className="text-gray-400" />
                <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                  Identificação
                </span>
              </div>
            </div>
            <Field
              label="Razão Social / Nome da Empresa *"
              field="name"
              wide
              placeholder="Ex: Empresa Licitações Ltda."
            />
            <Field
              label="CNPJ"
              field="cnpj"
              placeholder="00.000.000/0000-00"
              hint="Formato: XX.XXX.XXX/XXXX-XX"
            />
            <Field label="E-mail" field="email" type="email" placeholder="contato@empresa.com.br" />
            <Field label="Telefone / WhatsApp" field="phone" placeholder="(00) 00000-0000" />
            <Field label="Website" field="website" wide placeholder="https://www.empresa.com.br" />

            {/* Endereço */}
            <div className="col-span-2 mt-2">
              <div className="its-rule mb-1" />
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                Endereço
              </div>
            </div>
            <Field label="Endereço (Rua, Número, Complemento)" field="address" wide placeholder="Rua Exemplo, 123, Sala 1" />
            <Field label="Cidade" field="city" placeholder="São Paulo" />
            <Field label="Estado (UF)" field="state" placeholder="SP" hint="Apenas a sigla, ex: SP" />
            <Field label="CEP" field="zipCode" placeholder="00000-000" />

            {/* Logo */}
            <div className="col-span-2 mt-2">
              <div className="its-rule mb-1" />
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                Logo e Identidade Visual
              </div>
            </div>
            <div className="col-span-2">
              <LogoUploader
                currentUrl={form.logoUrl}
                onUploaded={(url) => {
                  set("logoUrl", url);
                  // Auto-save logo URL after upload
                  upsert.mutate({
                    name: form.name || undefined,
                    cnpj: form.cnpj || null,
                    address: form.address || null,
                    city: form.city || null,
                    state: form.state || null,
                    zipCode: form.zipCode || null,
                    phone: form.phone || null,
                    email: form.email || null,
                    website: form.website || null,
                    logoUrl: url,
                    bankInfo: form.bankInfo || null,
                    notes: form.notes || null,
                  });
                }}
                onClear={() => set("logoUrl", "")}
              />
            </div>

            {/* Dados Bancários */}
            <div className="col-span-2 mt-2">
              <div className="its-rule mb-1" />
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                Dados Bancários
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                Informações Bancárias
              </label>
              <textarea
                value={form.bankInfo}
                onChange={(e) => set("bankInfo", e.target.value)}
                rows={3}
                placeholder="Banco: 001 - Banco do Brasil&#10;Agência: 0001-1&#10;Conta Corrente: 00000-0&#10;PIX: 00.000.000/0000-00"
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none transition-colors"
              />
              <div className="text-[10px] text-gray-400 mt-0.5">
                Aparece no rodapé das propostas comerciais
              </div>
            </div>

            {/* Precificação */}
            <div className="col-span-2 mt-2">
              <div className="its-rule mb-1" />
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                Precificação
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                Margem Mínima Global (%)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.minMarginPercent}
                  onChange={(e) => set("minMarginPercent", e.target.value)}
                  className="w-28 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 transition-colors"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                Itens da proposta com margem abaixo deste valor serão destacados em vermelho
              </div>
            </div>

            {/* Observações */}
            <div className="col-span-2 mt-2">
              <div className="its-rule mb-1" />
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                Observações Padrão
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                Texto Padrão para Propostas
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="Ex: Preços sujeitos a alteração sem aviso prévio. Validade da proposta conforme indicado."
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none transition-colors"
              />
              <div className="text-[10px] text-gray-400 mt-0.5">
                Texto que aparece nas observações das propostas
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-8 pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={upsert.isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {upsert.isPending ? "Salvando..." : "Salvar Configurações"}
            </button>
          </div>
        </form>
      )}

      {isAdmin && <EmailConfigSection />}
    </div>
  );
}
