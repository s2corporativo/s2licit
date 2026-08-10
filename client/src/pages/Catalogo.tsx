import { Link } from "wouter";
import { Building2, FileUp, Images, Package, Search, Sparkles, Tags } from "lucide-react";

const AREAS = [
  {
    href: "/produtos",
    icon: Package,
    title: "Produtos e preços",
    text: "Cadastro, edição, histórico, ofertas por fornecedor e dados técnicos.",
    primary: true,
  },
  {
    href: "/fornecedores",
    icon: Building2,
    title: "Fornecedores",
    text: "Fornecedores, disponibilidade e origem dos custos.",
  },
  {
    href: "/busca-global?modo=precos",
    icon: Search,
    title: "Busca e equivalências",
    text: "Encontrar menor preço, similares e alternativas no catálogo.",
  },
  {
    href: "/captura-inteligente",
    icon: FileUp,
    title: "Fontes e importação",
    text: "Captura multi-origem, planilhas, PDFs, XML e outras fontes.",
  },
  {
    href: "/enriquecimento",
    icon: Sparkles,
    title: "Qualidade e enriquecimento",
    text: "Completar ficha técnica, revisar qualidade e enriquecer dados com IA.",
  },
  {
    href: "/imagens",
    icon: Images,
    title: "Imagens",
    text: "Revisar e completar imagens vinculadas aos produtos.",
  },
] as const;

export default function Catalogo() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-2xl bg-blue-950 p-5 text-white">
        <div className="flex items-start gap-3">
          <Tags size={26} className="mt-0.5" />
          <div>
            <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Base operacional</p>
            <h1 className="mb-1 mt-1 text-2xl font-black">Catálogo</h1>
            <p className="m-0 max-w-3xl text-sm text-blue-100">Produtos, fornecedores, preços, importação e qualidade em uma única entrada. As ferramentas especializadas continuam disponíveis sem poluir o menu principal.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {AREAS.map(({ href, icon: Icon, title, text, primary }) => (
          <Link key={href} href={href} className={`group rounded-xl border bg-white p-5 no-underline transition hover:-translate-y-0.5 hover:shadow-sm ${primary ? "border-blue-200 ring-1 ring-blue-100" : "border-slate-200 hover:border-blue-300"}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-900"><Icon size={19} /></div>
            <h2 className="mb-1 mt-4 text-sm font-black text-slate-900">{title}</h2>
            <p className="m-0 text-xs leading-relaxed text-slate-500">{text}</p>
            <div className="mt-4 text-[10px] font-black uppercase tracking-wider text-blue-800">Abrir</div>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-black text-slate-900">Ferramentas avançadas</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <SmallLink href="/equivalencias">Equivalências cadastradas</SmallLink>
          <SmallLink href="/analise-precos">Análise de preços</SmallLink>
          <SmallLink href="/reclassificacao">Reclassificação IA</SmallLink>
          <SmallLink href="/importar-nfe">Importar NF-e</SmallLink>
          <SmallLink href="/captura-revisao">Revisão de capturas</SmallLink>
          <SmallLink href="/categorias">Categorias</SmallLink>
          <SmallLink href="/sinonimos">Sinônimos</SmallLink>
        </div>
      </section>
    </div>
  );
}

function SmallLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 no-underline hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900">{children}</Link>;
}
