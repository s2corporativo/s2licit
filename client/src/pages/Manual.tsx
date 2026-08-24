import { useAuth } from "@/_core/hooks/useAuth";
import { hasMinimumRole, type Role } from "@/lib/access";
import { ArrowRight, BookOpen, BookText, CheckCircle2, Wrench } from "lucide-react";
import { Link } from "wouter";

type ManualLink = {
  href: string;
  label: string;
  minRole?: Role;
};

type FlowStep = {
  title: string;
  objective: string;
  instruction: string;
  links: ManualLink[];
};

const FLOW: FlowStep[] = [
  {
    title: "0. Preparar o sistema (uma única vez)",
    objective: "Deixar o S2 pronto para cotar: empresa, catálogo, impostos e modelos.",
    instruction:
      "Preencha os dados da empresa (saem no rodapé das propostas), importe seu catálogo por planilha ou NF-e, cadastre os fornecedores, as regras de impostos e um template de proposta. O checklist \"Primeiros passos\" do Dashboard acompanha o que falta.",
    links: [
      { href: "/configuracao", label: "Dados da empresa", minRole: "admin" },
      { href: "/importar", label: "Importar planilha", minRole: "editor" },
      { href: "/fornecedores", label: "Fornecedores", minRole: "editor" },
      { href: "/tributos", label: "Motor tributário" },
      { href: "/templates-proposta", label: "Templates de proposta" },
    ],
  },
  {
    title: "1. Captar a oportunidade",
    objective: "Encontrar a demanda e reunir o documento de origem.",
    instruction:
      "Consulte o Radar de licitações ou as cotações recebidas e envie a opção escolhida ao Funil. O sistema evita duplicar a mesma oportunidade.",
    links: [
      { href: "/radar-pncp", label: "Radar de licitações", minRole: "editor" },
      { href: "/cotacoes-recebidas", label: "Cotações", minRole: "editor" },
      { href: "/edital", label: "Importar edital", minRole: "editor" },
    ],
  },
  {
    title: "2. Organizar no Funil",
    objective: "Manter uma única fila de trabalho e um responsável claro.",
    instruction:
      "Abra o card no Funil e registre GO (vamos participar) ou NO-GO (vamos deixar passar) com justificativa. Somente um GO libera análise, preço e proposta.",
    links: [
      { href: "/funil", label: "Abrir Funil" },
      { href: "/agenda", label: "Conferir Agenda" },
    ],
  },
  {
    title: "3. Montar e revisar a proposta",
    objective: "Transformar itens válidos em uma proposta pronta para aprovação.",
    instruction:
      "No card aprovado, clique em revisar edital. Vincule cada item ao catálogo, confirme custo e preço de venda; o sistema bloqueia itens incompletos. A margem usada em todo o sistema é a margem sobre a venda: preço = custo ÷ (1 − margem).",
    links: [
      { href: "/edital", label: "Importar edital", minRole: "editor" },
      { href: "/propostas", label: "Revisar propostas", minRole: "editor" },
      { href: "/custo-total", label: "Custo total e fretes" },
    ],
  },
  {
    title: "4. Habilitar e disputar",
    objective: "Chegar à sessão com documentação e limites comerciais definidos.",
    instruction:
      "Confira os documentos de habilitação (os que provam que a empresa pode contratar com o governo), mantenha as certidões válidas e use a Sala de Disputa para acompanhar os limites de preço aprovados.",
    links: [
      { href: "/documentos-habilitacao", label: "Habilitação", minRole: "editor" },
      { href: "/certidoes", label: "Certidões", minRole: "admin" },
      { href: "/sala-disputa", label: "Sala de disputa", minRole: "editor" },
    ],
  },
  {
    title: "5. Executar o ganho",
    objective: "Comprar, entregar, faturar e receber sem perder prazos.",
    instruction:
      "Registre pedidos, entregas, notas e contas no Pós-venda. Use o Financeiro para acompanhar o resultado.",
    links: [
      { href: "/pos-venda", label: "Pós-venda" },
      { href: "/financeiro", label: "Financeiro", minRole: "editor" },
    ],
  },
  {
    title: "6. Gerir a operação",
    objective: "Começar o dia pelo que exige ação e medir o resultado.",
    instruction:
      "Use Dashboard e Agenda diariamente. Revise o Desempenho para corrigir margem, prazo e taxa de vitória.",
    links: [
      { href: "/", label: "Dashboard" },
      { href: "/agenda", label: "Agenda" },
      { href: "/desempenho", label: "Desempenho" },
    ],
  },
];

const ADVANCED_GROUPS: Array<{ label: string; links: ManualLink[] }> = [
  {
    label: "Catálogo no dia a dia",
    links: [
      { href: "/produtos", label: "Produtos (catálogo completo)" },
      { href: "/busca", label: "Busca de menor preço" },
      { href: "/busca-global", label: "Busca global" },
      { href: "/equivalencias", label: "Produtos equivalentes" },
      { href: "/categorias", label: "Categorias" },
      { href: "/imagens", label: "Imagens" },
    ],
  },
  {
    label: "Pesquisa e precificação",
    links: [
      { href: "/comparacao", label: "Comparação de preços" },
      { href: "/analise-precos", label: "Análise de preços", minRole: "editor" },
      { href: "/custo-total", label: "Custo total e fretes" },
      { href: "/tributos", label: "Motor tributário" },
      { href: "/aplicar-precificacao", label: "Precificação em massa", minRole: "admin" },
      { href: "/regras-categoria", label: "Regras por categoria", minRole: "admin" },
    ],
  },
  {
    label: "Dados e IA",
    links: [
      { href: "/enriquecimento", label: "Completar dados (IA)" },
      { href: "/reclassificacao", label: "Reclassificação IA", minRole: "editor" },
      { href: "/qualidade", label: "Qualidade de dados", minRole: "editor" },
      { href: "/sinonimos", label: "Sinônimos" },
      { href: "/importar-nfe", label: "Importar NF-e", minRole: "editor" },
      { href: "/enriquecimento-nfe", label: "Pipeline NF-e", minRole: "editor" },
      { href: "/historico-enriquecimento", label: "Histórico de enriquecimento", minRole: "editor" },
      { href: "/agente", label: "Assistente IA" },
    ],
  },
  {
    label: "Captura de preços de fornecedores",
    links: [
      { href: "/scraper-fornecedores", label: "Captura automática de preços", minRole: "admin" },
      { href: "/captura-inteligente", label: "Central de captura", minRole: "editor" },
      { href: "/captura-revisao", label: "Revisão de capturas", minRole: "editor" },
    ],
  },
  {
    label: "Documentação e apoio",
    links: [
      { href: "/certidoes", label: "Certidões", minRole: "admin" },
      { href: "/diligencias", label: "Diligências e recursos", minRole: "editor" },
      { href: "/portais-licitacao", label: "Portais de licitação", minRole: "admin" },
      { href: "/agente-proposta", label: "Agente de proposta", minRole: "editor" },
    ],
  },
  {
    label: "Administração do sistema",
    links: [
      { href: "/configuracao", label: "Dados da empresa", minRole: "admin" },
      { href: "/usuarios", label: "Usuários e permissões", minRole: "admin" },
      { href: "/seguranca", label: "Segurança da conta (verificação em duas etapas)" },
      { href: "/logs", label: "Logs de auditoria", minRole: "admin" },
      { href: "/central-ia", label: "Inteligência artificial", minRole: "admin" },
      { href: "/diagnostico", label: "Diagnóstico", minRole: "admin" },
      { href: "/admin/database-health", label: "Integridade do banco", minRole: "admin" },
    ],
  },
];

/** Glossário em linguagem simples — termos de licitação e do próprio sistema. */
const GLOSSARIO: Array<{ termo: string; definicao: string }> = [
  { termo: "Licitação / Pregão", definicao: "Processo público em que órgãos do governo compram produtos e serviços. Quem oferece o menor preço (cumprindo as regras) vence." },
  { termo: "Edital", definicao: "Documento oficial da licitação: lista os itens, quantidades, prazos e regras. É o arquivo que você importa na tela Importar edital." },
  { termo: "PNCP", definicao: "Portal Nacional de Contratações Públicas — site do governo federal que reúne as licitações do país. É de onde o Radar busca oportunidades." },
  { termo: "Habilitação", definicao: "Conjunto de documentos que provam que a sua empresa pode contratar com o governo (contrato social, certidões, atestados)." },
  { termo: "Certidões", definicao: "Comprovantes de regularidade (federal, FGTS, trabalhista etc.). Vencidas, impedem sua participação — o sistema avisa antes." },
  { termo: "GO / NO-GO", definicao: "Decisão registrada no Funil: GO = vamos participar desta oportunidade; NO-GO = vamos deixar passar (com o motivo)." },
  { termo: "SRP / Ata de registro de preços", definicao: "Modalidade em que o órgão registra seu preço para comprar aos poucos, durante meses, em vez de tudo de uma vez." },
  { termo: "Margem sobre a venda", definicao: "A margem única do sistema. Preço = custo ÷ (1 − margem). Ex.: custo R$ 100 com margem 20% → preço R$ 125. Diferente de markup (custo × 1,2 = R$ 120)." },
  { termo: "Piso (preço mínimo)", definicao: "O menor preço que cobre custo, frete e impostos com a margem mínima. Vender abaixo do piso é prejuízo — o sistema bloqueia." },
  { termo: "DIFAL / ICMS-ST / FCP", definicao: "Impostos estaduais que mudam conforme o estado de destino da venda. Cadastre-os no Motor tributário; o sistema calcula sozinho depois." },
  { termo: "Match / Vinculação", definicao: "Quando o sistema reconhece que um item do edital corresponde a um produto do seu catálogo. \"Sem match\" = não encontrou; vincule manualmente." },
  { termo: "Enriquecimento", definicao: "Completar automaticamente (com IA) os dados que faltam nos produtos: composição, apresentação, categoria, ficha técnica." },
  { termo: "Captura", definicao: "Buscar preços e produtos direto nos sites/arquivos dos fornecedores, de forma automática e agendada. Tudo passa por revisão antes de valer." },
  { termo: "EAN / GTIN", definicao: "O número do código de barras do produto. É a forma mais confiável de reconhecer o mesmo produto em fornecedores diferentes." },
  { termo: "Princípio ativo", definicao: "Nos medicamentos, a substância que faz efeito (ex.: Ivermectina). Em outros produtos, o equivalente é a especificação técnica principal." },
  { termo: "NF-e / XML", definicao: "Nota Fiscal Eletrônica. O arquivo XML da nota pode ser importado para cadastrar produtos e preços reais de compra automaticamente." },
  { termo: "Verificação em duas etapas (MFA)", definicao: "Proteção extra do login: além da senha, um código do celular. Ative na tela Segurança da conta." },
];

function LinkList({ links, role }: { links: ManualLink[]; role: unknown }) {
  const visibleLinks = links.filter((link) => hasMinimumRole(role, link.minRole));

  if (visibleLinks.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {visibleLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex items-center gap-1.5 border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-blue-700 hover:text-blue-800"
        >
          {link.label}
          <ArrowRight size={12} />
        </Link>
      ))}
    </div>
  );
}

export default function Manual() {
  const { user } = useAuth();

  const visibleAdvancedGroups = ADVANCED_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => hasMinimumRole(user?.role, link.minRole)),
  })).filter((group) => group.links.length > 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start gap-3 mb-6">
        <BookOpen className="w-7 h-7 text-blue-700 mt-0.5" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Como operar o S2</h1>
          <p className="text-sm text-gray-500 mt-1">
            Um fluxo único, da preparação ao recebimento — para cotações de qualquer segmento:
            medicamentos veterinários e humanos, materiais de construção, insumos e equipamentos.
          </p>
        </div>
      </div>

      <div className="border-l-4 border-emerald-600 bg-emerald-50 p-4 mb-6">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-900">Fluxo operacional integrado</p>
            <p className="text-sm text-emerald-800 mt-1">
              Radar, Cotações e Edital alimentam o mesmo Funil. A decisão GO/NO-GO, as etapas
              válidas e a proposta ficam registradas no histórico da oportunidade.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {FLOW.map((step) => (
          <section key={step.title} className="border border-gray-200 bg-white p-5">
            <h2 className="text-base font-bold text-gray-900">{step.title}</h2>
            <p className="text-sm font-semibold text-blue-800 mt-1">{step.objective}</p>
            <p className="text-sm text-gray-600 mt-2">{step.instruction}</p>
            <LinkList links={step.links} role={user?.role} />
          </section>
        ))}
      </div>

      <details className="border border-gray-200 bg-gray-50 mt-6" open>
        <summary className="cursor-pointer list-none p-4 flex items-center gap-2 text-sm font-bold text-gray-800">
          <BookText size={15} />
          Glossário — termos em linguagem simples
          <span className="ml-auto text-xs font-normal text-gray-500">abrir/fechar</span>
        </summary>
        <div className="border-t border-gray-200 p-4">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {GLOSSARIO.map((g) => (
              <div key={g.termo}>
                <dt className="text-xs font-bold text-gray-800">{g.termo}</dt>
                <dd className="text-xs leading-relaxed text-gray-600">{g.definicao}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>

      <details className="border border-gray-200 bg-gray-50 mt-4">
        <summary className="cursor-pointer list-none p-4 flex items-center gap-2 text-sm font-bold text-gray-800">
          <Wrench size={15} />
          Todas as telas do sistema
          <span className="ml-auto text-xs font-normal text-gray-500">abrir lista</span>
        </summary>
        <div className="border-t border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-4">
            Mapa completo, agrupado por assunto. As telas do fluxo principal acima cobrem o
            dia a dia; as demais são especializadas — use-as quando precisar.
          </p>
          <div className="space-y-5">
            {visibleAdvancedGroups.map((group) => (
              <section key={group.label}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  {group.label}
                </h3>
                <LinkList links={group.links} role={user?.role} />
              </section>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
