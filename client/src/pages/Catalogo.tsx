import { Link } from "wouter";
import { ArrowLeft, Building2, FileUp, Images, Loader2, Package, Search, Sparkles, Tags } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/format";

const AREAS = [
  { href: "/produtos", icon: Package, title: "Produtos e preços", text: "Cadastro, edição, histórico, ofertas por fornecedor e dados técnicos.", primary: true },
  { href: "/fornecedores", icon: Building2, title: "Fornecedores", text: "Fornecedores, disponibilidade e origem dos custos.", primary: false },
  { href: "/busca-global?modo=precos", icon: Search, title: "Busca e equivalências", text: "Encontrar menor preço, similares e alternativas no catálogo.", primary: false },
  { href: "/captura-inteligente", icon: FileUp, title: "Fontes e importação", text: "Captura multi-origem, planilhas, PDFs, XML e outras fontes.", primary: false },
  { href: "/enriquecimento", icon: Sparkles, title: "Qualidade e enriquecimento", text: "Completar ficha técnica, revisar qualidade e enriquecer dados com IA.", primary: false },
  { href: "/imagens", icon: Images, title: "Imagens", text: "Revisar e completar imagens vinculadas aos produtos.", primary: false },
] as const;

export default function Catalogo() {
  const params = new URLSearchParams(window.location.search);
  const productId = Number(params.get("produto"));
  const supplierId = Number(params.get("fornecedor"));
  if (Number.isInteger(productId) && productId > 0) return <ProductRecord id={productId} />;
  if (Number.isInteger(supplierId) && supplierId > 0) return <SupplierRecord id={supplierId} />;

  return <div className="mx-auto max-w-6xl space-y-5">
    <Header subtitle="Produtos, fornecedores, preços, importação e qualidade em uma única entrada. As ferramentas especializadas continuam disponíveis sem poluir o menu principal." />
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{AREAS.map(({ href, icon: Icon, title, text, primary }) => <Link key={href} href={href} className={`group rounded-xl border bg-white p-5 no-underline transition hover:-translate-y-0.5 hover:shadow-sm ${primary ? "border-blue-200 ring-1 ring-blue-100" : "border-slate-200 hover:border-blue-300"}`}><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-900"><Icon size={19} /></div><h2 className="mb-1 mt-4 text-sm font-black text-slate-900">{title}</h2><p className="m-0 text-xs leading-relaxed text-slate-500">{text}</p><div className="mt-4 text-[10px] font-black uppercase tracking-wider text-blue-800">Abrir</div></Link>)}</section>
    <section className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-900">Ferramentas avançadas</div><div className="mt-3 flex flex-wrap gap-2"><SmallLink href="/equivalencias">Equivalências cadastradas</SmallLink><SmallLink href="/analise-precos">Análise de preços</SmallLink><SmallLink href="/reclassificacao">Reclassificação IA</SmallLink><SmallLink href="/importar-nfe">Importar NF-e</SmallLink><SmallLink href="/captura-revisao">Revisão de capturas</SmallLink><SmallLink href="/categorias">Categorias</SmallLink><SmallLink href="/sinonimos">Sinônimos</SmallLink></div></section>
  </div>;
}

function ProductRecord({ id }: { id: number }) {
  const query = trpc.products.get.useQuery({ id });
  if (query.isLoading) return <Loading />;
  const product = query.data as any;
  if (!product) return <NotFound label="Produto não encontrado." />;
  return <div className="mx-auto max-w-5xl space-y-5"><Header subtitle="Registro aberto diretamente pela busca global." /><Back /><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-4 sm:flex-row"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" /> : <Package className="text-slate-300" />}</div><div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-wider text-blue-700">Produto #{product.id}</div><h1 className="mt-1 text-xl font-black text-slate-950">{product.name}</h1><p className="mt-1 text-xs text-slate-500">{[product.manufacturer, product.activeIngredient, product.concentration, product.presentation].filter(Boolean).join(" · ")}</p><div className="mt-4 grid gap-2 sm:grid-cols-3"><Info label="Preço" value={product.price ? formatBRL(Number(product.price)) : "Sem preço"} /><Info label="Unidade" value={product.unit ?? product.priceUnit ?? "—"} /><Info label="Registro" value={product.mapa ?? product.registroRegulatorio ?? "—"} /></div></div></div><div className="mt-5 flex flex-wrap gap-2"><Link href="/produtos" className="rounded-lg bg-blue-950 px-3 py-2 text-xs font-bold text-white no-underline">Abrir gestão de produtos</Link>{product.productUrl && <a href={product.productUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 no-underline">Abrir fonte</a>}</div></section></div>;
}

function SupplierRecord({ id }: { id: number }) {
  const query = trpc.suppliers.get.useQuery({ id });
  if (query.isLoading) return <Loading />;
  const supplier = query.data as any;
  if (!supplier) return <NotFound label="Fornecedor não encontrado." />;
  return <div className="mx-auto max-w-5xl space-y-5"><Header subtitle="Registro aberto diretamente pela busca global." /><Back /><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-wider text-blue-700">Fornecedor #{supplier.id}</div><h1 className="mt-1 text-xl font-black text-slate-950">{supplier.name}</h1><div className="mt-4 grid gap-2 sm:grid-cols-3"><Info label="Código" value={supplier.code ?? "—"} /><Info label="Contato" value={supplier.contact ?? supplier.email ?? "—"} /><Info label="Telefone" value={supplier.phone ?? "—"} /></div>{supplier.notes && <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{supplier.notes}</div>}<Link href="/fornecedores" className="mt-5 inline-block rounded-lg bg-blue-950 px-3 py-2 text-xs font-bold text-white no-underline">Abrir gestão de fornecedores</Link></section></div>;
}

function Header({ subtitle }: { subtitle: string }) { return <section className="rounded-2xl bg-blue-950 p-5 text-white"><div className="flex items-start gap-3"><Tags size={26} className="mt-0.5" /><div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Base operacional</p><h1 className="mb-1 mt-1 text-2xl font-black">Catálogo</h1><p className="m-0 max-w-3xl text-sm text-blue-100">{subtitle}</p></div></div></section>; }
function Back() { return <Link href="/catalogo" className="inline-flex items-center gap-1 text-xs font-bold text-blue-900 no-underline"><ArrowLeft size={13} /> Voltar ao catálogo</Link>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 truncate text-xs font-bold text-slate-700">{value}</div></div>; }
function SmallLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 no-underline hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900">{children}</Link>; }
function Loading() { return <div className="flex min-h-[50vh] items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>; }
function NotFound({ label }: { label: string }) { return <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">{label}<div className="mt-3"><Back /></div></div>; }
