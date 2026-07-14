import { useAuth } from "@/_core/hooks/useAuth";
import { hasMinimumRole, type Role } from "@/lib/access";
import { ArrowRight, BookOpen, CircleAlert, Wrench } from "lucide-react";
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
    title: "1. Captar a oportunidade",
    objective: "Encontrar a demanda e reunir o documento de origem.",
    instruction:
      "Consulte o Radar, revise as cotações recebidas ou importe o edital. Antes de avançar, confirme órgão, processo, prazo e itens.",
    links: [
      { href: "/radar-pncp", label: "Radar PNCP", minRole: "editor" },
      { href: "/cotacoes-recebidas", label: "Cotações", minRole: "editor" },
      { href: "/edital", label: "Importar edital", minRole: "editor" },
    ],
  },
  {
    title: "2. Organizar no Funil",
    objective: "Manter uma única fila de trabalho e um responsável claro.",
    instruction:
      "Crie ou localize o card no Funil, registre a próxima ação e use o número do processo como referência comum entre as telas.",
    links: [
      { href: "/funil", label: "Abrir Funil" },
      { href: "/agenda", label: "Conferir Agenda" },
    ],
  },
  {
    title: "3. Montar e revisar a proposta",
    objective: "Transformar itens válidos em uma proposta pronta para aprovação.",
    instruction:
      "Vincule cada item ao catálogo, confirme custo e preço de venda e abra a proposta criada. Não exporte enquanto houver item sem preço.",
    links: [
      { href: "/edital", label: "Importar edital", minRole: "editor" },
      { href: "/propostas", label: "Revisar propostas" },
    ],
  },
  {
    title: "4. Habilitar e disputar",
    objective: "Chegar à sessão com documentação e limites comerciais definidos.",
    instruction:
      "Confira os documentos de habilitação e use a Sala de Disputa para acompanhar os limites de preço aprovados.",
    links: [
      { href: "/documentos-habilitacao", label: "Habilitação", minRole: "editor" },
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
      { href: "/financeiro", label: "Financeiro" },
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
    label: "Pesquisa e precificação",
    links: [
      { href: "/busca-global", label: "Busca global" },
      { href: "/busca", label: "Busca rápida" },
      { href: "/comparacao", label: "Comparação de preços" },
      { href: "/analise-precos", label: "Análise de preços", minRole: "editor" },
      { href: "/custo-total", label: "Custo total e fretes" },
      { href: "/tributos", label: "Motor tributário" },
      { href: "/aplicar-precificacao", label: "Precificação em massa", minRole: "admin" },
      { href: "/regras-categoria", label: "Regras por categoria", minRole: "admin" },
    ],
  },
  {
    label: "Catálogo e dados",
    links: [
      { href: "/categorias", label: "Categorias" },
      { href: "/imagens", label: "Imagens" },
      { href: "/qualidade", label: "Qualidade de dados", minRole: "editor" },
      { href: "/enriquecimento", label: "Enriquecimento IA" },
      { href: "/reclassificacao", label: "Reclassificação IA", minRole: "editor" },
      { href: "/sinonimos", label: "Sinônimos" },
      { href: "/importar-nfe", label: "Importar NF-e", minRole: "editor" },
      { href: "/enriquecimento-nfe", label: "Pipeline NF-e", minRole: "editor" },
      { href: "/historico-enriquecimento", label: "Histórico de enriquecimento", minRole: "editor" },
    ],
  },
  {
    label: "Documentação e apoio",
    links: [
      { href: "/certidoes", label: "Certidões", minRole: "editor" },
      { href: "/diligencias", label: "Diligências", minRole: "editor" },
      { href: "/portais-licitacao", label: "Portais de licitação", minRole: "editor" },
      { href: "/templates-proposta", label: "Templates de proposta" },
    ],
  },
  {
    label: "Módulos paralelos ou especializados",
    links: [
      { href: "/central-operacional", label: "Central operacional", minRole: "editor" },
      { href: "/decisao-executiva", label: "Decisão executiva", minRole: "editor" },
      { href: "/proposta-rapida", label: "Proposta rápida" },
      { href: "/proposta-automatica", label: "Proposta automática" },
      { href: "/propostas-admin", label: "Administração de propostas", minRole: "admin" },
      { href: "/agente-proposta", label: "Agente de propostas", minRole: "editor" },
      { href: "/contratos-pos-licitacao", label: "Painel de contratos", minRole: "editor" },
      { href: "/captura-inteligente", label: "Captura inteligente", minRole: "editor" },
      { href: "/captura-revisao", label: "Revisão de capturas", minRole: "editor" },
      { href: "/captura-scheduler", label: "Agendador de captura", minRole: "editor" },
      { href: "/captura-analytics", label: "Analytics de captura", minRole: "editor" },
      { href: "/configurador-fornecedores", label: "Credenciais de fornecedores", minRole: "admin" },
      { href: "/scraper-fornecedores", label: "Agente de preços", minRole: "admin" },
      { href: "/agente", label: "Assistente IA" },
      { href: "/central-ia", label: "Central de IA", minRole: "admin" },
      { href: "/diagnostico", label: "Diagnóstico", minRole: "editor" },
      { href: "/admin/database-health", label: "Integridade do banco", minRole: "admin" },
    ],
  },
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
            Um fluxo único, da oportunidade ao recebimento.
          </p>
        </div>
      </div>

      <div className="border-l-4 border-amber-500 bg-amber-50 p-4 mb-6">
        <div className="flex items-start gap-2">
          <CircleAlert className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-900">Integração ainda manual</p>
            <p className="text-sm text-amber-800 mt-1">
              Radar e Cotações ainda não criam automaticamente um card no Funil. Ao decidir
              avançar, registre a oportunidade no Funil e repita o número do processo para
              manter a rastreabilidade.
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

      <details className="border border-gray-200 bg-gray-50 mt-6">
        <summary className="cursor-pointer list-none p-4 flex items-center gap-2 text-sm font-bold text-gray-800">
          <Wrench size={15} />
          Ferramentas avançadas
          <span className="ml-auto text-xs font-normal text-gray-500">abrir lista</span>
        </summary>
        <div className="border-t border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-4">
            Estas rotas foram preservadas por compatibilidade. Algumas são especializadas ou
            ainda operam fora do fluxo principal; use-as quando houver um procedimento interno
            definido.
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
