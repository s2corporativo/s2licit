import { useState } from "react";
import { Link } from "wouter";
import { BookOpen, ChevronRight, Search } from "lucide-react";

/**
 * Manual de Uso: guia intuitivo de cada ferramenta — para que serve e como
 * usar — organizado pelo fluxo do negócio, da oportunidade ao recebimento.
 */

interface Ferramenta {
  nome: string;
  rota: string;
  paraQue: string;
  comoUsar: string;
}
interface Secao {
  grupo: string;
  intro: string;
  ferramentas: Ferramenta[];
}

const MANUAL: Secao[] = [
  {
    grupo: "Geral",
    intro: "Sua visão do dia e os atalhos que você mais usa.",
    ferramentas: [
      { nome: "Dashboard", rota: "/", paraQue: "Retrato do momento: oportunidades abertas, prazos, faturamento e margem.", comoUsar: "É a tela inicial. Bate o olho ao começar o dia para ver o que precisa de atenção." },
      { nome: "Busca Global", rota: "/busca-global", paraQue: "Achar qualquer coisa no sistema (órgão, produto, processo, nota, fornecedor) num campo só.", comoUsar: "Digite qualquer termo e o sistema procura em todas as áreas ao mesmo tempo, com link direto." },
      { nome: "Agenda", rota: "/agenda", paraQue: "Todos os prazos num lugar: cotações a responder, certidões vencendo e contratos encerrando.", comoUsar: "Confira diariamente. Os itens ficam ordenados por urgência, com contagem regressiva." },
      { nome: "Desempenho", rota: "/desempenho", paraQue: "Sua taxa de vitória: onde você ganha e onde perde dinheiro.", comoUsar: "Dê baixa no resultado de cada cotação (ganhou/perdeu) e veja o win rate por órgão e categoria." },
      { nome: "Central de Diagnóstico", rota: "/diagnostico", paraQue: "Painel de saúde do sistema — mostra erros, integrações desligadas e o que fazer.", comoUsar: "Abra quando algo parecer errado. Cada alerta traz a ação recomendada." },
      { nome: "Manual de Uso", rota: "/manual", paraQue: "Este guia.", comoUsar: "Consulte quando tiver dúvida sobre qualquer ferramenta." },
    ],
  },
  {
    grupo: "Oportunidades",
    intro: "Onde as licitações entram e viram trabalho organizado.",
    ferramentas: [
      { nome: "Funil de Oportunidades", rota: "/funil", paraQue: "Kanban do ciclo inteiro, da triagem ao recebimento.", comoUsar: "Cada licitação é um card. Arraste/mova entre as etapas — todo movimento fica registrado no histórico." },
      { nome: "Radar de Oportunidades", rota: "/radar-pncp", paraQue: "Licitações públicas capturadas do PNCP conforme suas palavras-chave.", comoUsar: "Configure as palavras-chave e o sistema traz as licitações novas que combinam com o seu catálogo." },
      { nome: "Cotações Recebidas", rota: "/cotacoes-recebidas", paraQue: "Pedidos de cotação que chegaram por e-mail, com itens já extraídos.", comoUsar: "As cotações entram sozinhas a cada 15 min. Abra, confira o casamento com o catálogo e gere a resposta." },
      { nome: "Central Operacional", rota: "/central-operacional", paraQue: "Visão consolidada da operação de propostas.", comoUsar: "Use como painel de trabalho para acompanhar o andamento geral." },
      { nome: "Importar Edital", rota: "/edital", paraQue: "Ler um edital/termo de referência com IA e extrair itens e exigências.", comoUsar: "Suba o PDF do edital; a IA resume, lista os itens e aponta riscos e exigências." },
      { nome: "Decisão Executiva", rota: "/decisao-executiva", paraQue: "Responder objetivamente: 'vale a pena entrar nesta licitação?'", comoUsar: "O sistema cruza margem, aderência ao catálogo e risco e dá a recomendação." },
    ],
  },
  {
    grupo: "Preços & Precificação",
    intro: "O coração do lucro: descobrir o preço certo que ganha sem perder margem.",
    ferramentas: [
      { nome: "Busca Rápida", rota: "/busca", paraQue: "Consultar rapidamente um produto e seu preço.", comoUsar: "Digite o produto para ver preço e dados sem abrir o catálogo inteiro." },
      { nome: "Comparação de Preços", rota: "/comparacao", paraQue: "Comparar preços entre fornecedores/fontes.", comoUsar: "Selecione os itens e veja lado a lado quem tem o melhor preço." },
      { nome: "Análise de Preços", rota: "/analise-precos", paraQue: "Estatística de preços praticados (menor, médio, mediana) por item.", comoUsar: "Use para calibrar sua proposta com base no histórico." },
      { nome: "Sala de Disputa", rota: "/sala-disputa", paraQue: "A tabela de guerra do pregão: preço-piso (não desça), sugerido e alvo por item.", comoUsar: "Informe custos e margens; o sistema mostra o piso em vermelho e o preço-para-ganhar em verde." },
      { nome: "Custo Total & Fretes", rota: "/custo-total", paraQue: "Custo REAL de aquisição: produto + frete + impostos + taxas.", comoUsar: "Preencha preço do fornecedor, fretes e UF de destino; o sistema calcula o piso que cobre tudo." },
      { nome: "Motor Tributário", rota: "/tributos", paraQue: "Estimar impostos por operação (Simples, DIFAL, ICMS-ST) por UF.", comoUsar: "Cadastre as regras (alíquota do Simples, DIFAL por UF) e simule a carga de cada venda. Valide com seu contador." },
      { nome: "Precificação em Massa", rota: "/aplicar-precificacao", paraQue: "Aplicar margem/preço a vários produtos de uma vez.", comoUsar: "Selecione os produtos, defina a regra e aplique em lote." },
      { nome: "Regras por Categoria", rota: "/regras-categoria", paraQue: "Definir margem/markup padrão por categoria de produto.", comoUsar: "Cadastre a regra de cada categoria para automatizar a precificação." },
    ],
  },
  {
    grupo: "Propostas",
    intro: "Montar, revisar e enviar a proposta comercial.",
    ferramentas: [
      { nome: "Proposta Rápida", rota: "/proposta-rapida", paraQue: "Gerar uma proposta simples em poucos cliques.", comoUsar: "Preencha itens e valores; o sistema monta o documento." },
      { nome: "Proposta Automática", rota: "/proposta-automatica", paraQue: "Gerar a proposta a partir de um edital/cotação com apoio da IA.", comoUsar: "A partir do documento importado, o sistema pré-preenche a proposta." },
      { nome: "Propostas Comerciais", rota: "/propostas", paraQue: "Listar, editar e exportar suas propostas (PDF/Excel).", comoUsar: "Abra uma proposta para ajustar itens, preços e declarações antes de enviar." },
      { nome: "Templates de Proposta", rota: "/templates-proposta", paraQue: "Modelos reutilizáveis por órgão/tipo.", comoUsar: "Crie modelos com cabeçalho e cláusulas padrão para agilizar." },
      { nome: "Adm. Propostas", rota: "/propostas-admin", paraQue: "Gestão administrativa/aprovação das propostas.", comoUsar: "Use para acompanhar o fluxo de aprovação interna." },
      { nome: "Agente de Propostas", rota: "/agente-proposta", paraQue: "Robô que preenche a proposta nos portais (semi-automático).", comoUsar: "O robô preenche; você confere e envia. Nunca envia sozinho — por segurança." },
    ],
  },
  {
    grupo: "Habilitação & Disputa",
    intro: "Documentação em dia e acompanhamento da sessão.",
    ferramentas: [
      { nome: "Certidões", rota: "/certidoes", paraQue: "Controlar validade das certidões (a causa nº 1 de perder habilitação).", comoUsar: "Cadastre cada certidão com a data de validade; o sistema alerta antes de vencer." },
      { nome: "Documentos", rota: "/documentos-habilitacao", paraQue: "Repositório dos documentos de habilitação da empresa.", comoUsar: "Guarde contrato social, atestados, licenças etc. num lugar só." },
      { nome: "Diligências", rota: "/diligencias", paraQue: "Acompanhar pedidos de esclarecimento, impugnações e recursos.", comoUsar: "Registre e acompanhe cada diligência do processo." },
      { nome: "Portais de Licitação", rota: "/portais-licitacao", paraQue: "Cofre de credenciais dos portais (Funarbe, COPASA, Fundep…).", comoUsar: "Cadastre usuário e senha (criptografados) e abra o portal já com o login copiado." },
    ],
  },
  {
    grupo: "Pós-venda & Financeiro",
    intro: "Depois da vitória: comprar, entregar, faturar e receber.",
    ferramentas: [
      { nome: "Pós-venda", rota: "/pos-venda", paraQue: "Pedidos ao fornecedor, entregas, notas fiscais, contas e fluxo de caixa.", comoUsar: "Ao vencer, registre o pedido de compra; acompanhe entrega → NF → recebimento. A aba Fluxo de Caixa projeta o mês." },
      { nome: "Contratos Pós-Licitação", rota: "/contratos-pos-licitacao", paraQue: "Gestão de atas, contratos e empenhos com saldo e vigência.", comoUsar: "Cadastre o contrato para controlar saldo, prazos e reajustes." },
      { nome: "Controle Financeiro", rota: "/financeiro", paraQue: "Visão financeira geral.", comoUsar: "Acompanhe entradas e saídas ligadas às propostas." },
    ],
  },
  {
    grupo: "Catálogo",
    intro: "A base de tudo: seus produtos bem cadastrados e classificados.",
    ferramentas: [
      { nome: "Produtos", rota: "/produtos", paraQue: "Cadastro mestre de produtos.", comoUsar: "Consulte, edite e mantenha os dados técnicos de cada produto." },
      { nome: "Categorias", rota: "/categorias", paraQue: "Organizar o catálogo em categorias.", comoUsar: "Estruture os produtos por família para facilitar preço e busca." },
      { nome: "Equivalências", rota: "/equivalencias", paraQue: "Relacionar produtos equivalentes por atributos técnicos.", comoUsar: "Use para ofertar um equivalente quando o edital pede uma marca específica." },
      { nome: "Imagens", rota: "/imagens", paraQue: "Galeria de imagens dos produtos.", comoUsar: "Suba e valide fotos/rótulos de cada item." },
      { nome: "Qualidade de Dados", rota: "/qualidade", paraQue: "Encontrar produtos com dados faltando ou duplicados.", comoUsar: "Rode para achar o que precisa de correção no catálogo." },
      { nome: "Enriquecimento IA", rota: "/enriquecimento", paraQue: "Preencher fichas técnicas dos produtos com IA, em lote.", comoUsar: "Filtre produtos sem ficha e deixe a IA sugerir; revise e aplique em massa." },
      { nome: "Reclassificação IA", rota: "/reclassificacao", paraQue: "Reorganizar produtos nas categorias certas com IA.", comoUsar: "A IA sugere a categoria correta; você aprova as mudanças." },
      { nome: "Sinônimos", rota: "/sinonimos", paraQue: "Ensinar o sistema a reconhecer nomes alternativos dos produtos.", comoUsar: "Cadastre apelidos para melhorar o casamento das cotações com o catálogo." },
    ],
  },
  {
    grupo: "Fornecedores & Captura",
    intro: "Seus fornecedores e a captura automática de preços.",
    ferramentas: [
      { nome: "Fornecedores", rota: "/fornecedores", paraQue: "Cadastro de fornecedores e condições.", comoUsar: "Registre dados, contatos, prazos e política de frete de cada fornecedor." },
      { nome: "Credenciais de Fornecedores", rota: "/configurador-fornecedores", paraQue: "Guardar (criptografado) o login dos sites dos fornecedores e testar a conexão.", comoUsar: "Cadastre usuário/senha do portal do fornecedor; use 'testar conexão' para validar." },
      { nome: "Agente de Preços", rota: "/scraper-fornecedores", paraQue: "Robô que busca preços nos sites dos fornecedores.", comoUsar: "Adicione o fornecedor e rode a captura; acompanhe o log em tempo real." },
      { nome: "Captura Inteligente", rota: "/captura-inteligente", paraQue: "Capturar produtos/preços de várias origens.", comoUsar: "Use para trazer catálogos externos para dentro do sistema." },
      { nome: "Agendador de Captura", rota: "/captura-scheduler", paraQue: "Programar a captura de preços para rodar sozinha.", comoUsar: "Escolha o fornecedor e a frequência; a captura roda no horário definido." },
      { nome: "Analytics de Captura", rota: "/captura-analytics", paraQue: "Métricas das capturas (o que foi coletado, falhas).", comoUsar: "Acompanhe o desempenho das capturas automáticas." },
      { nome: "Pipeline NF-e", rota: "/enriquecimento-nfe", paraQue: "Enriquecer produtos a partir de notas fiscais eletrônicas.", comoUsar: "Importe a NF-e e o sistema extrai/enriquece os itens." },
      { nome: "Histórico de Enriquecimento", rota: "/historico-enriquecimento", paraQue: "Ver o que a IA já enriqueceu.", comoUsar: "Consulte o histórico das rodadas de enriquecimento." },
    ],
  },
  {
    grupo: "IA & Sistema",
    intro: "A inteligência do sistema e as configurações.",
    ferramentas: [
      { nome: "Assistente IA", rota: "/agente", paraQue: "Chat de IA para tirar dúvidas e pedir ajuda sobre seus dados.", comoUsar: "Pergunte em linguagem natural; o assistente consulta o sistema para responder." },
      { nome: "Central de IA", rota: "/central-ia", paraQue: "Ver e escolher o provedor de IA ativo (Groq/Anthropic).", comoUsar: "Confira qual IA está ligada e o status." },
      { nome: "Importar Planilha", rota: "/importar", paraQue: "Trazer seu catálogo/dados de uma planilha Excel.", comoUsar: "Suba o arquivo (ex.: CONSOLIDADO_FINAL.xlsx) e o sistema importa os produtos." },
      { nome: "Importar NF-e", rota: "/importar-nfe", paraQue: "Importar produtos a partir de XML de nota fiscal.", comoUsar: "Suba o XML da NF-e para cadastrar/atualizar produtos." },
      { nome: "Configurações", rota: "/configuracao", paraQue: "Dados da empresa, margens padrão e logotipo.", comoUsar: "Preencha os dados que entram nas propostas e as margens mínima/desejada." },
    ],
  },
];

export default function Manual() {
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const secoes = termo
    ? MANUAL.map((s) => ({
        ...s,
        ferramentas: s.ferramentas.filter(
          (f) => f.nome.toLowerCase().includes(termo) || f.paraQue.toLowerCase().includes(termo),
        ),
      })).filter((s) => s.ferramentas.length > 0)
    : MANUAL;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manual de Uso</h1>
          <p className="text-sm text-gray-500">Para que serve cada ferramenta e como usar — do começo ao fim do processo</p>
        </div>
      </div>

      <div className="relative my-5">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar ferramenta… (ex.: certidão, frete, funil)"
          className="w-full border border-gray-300 pl-9 pr-3 py-2.5 text-sm focus:border-blue-500 outline-none"
        />
      </div>

      <div className="space-y-8">
        {secoes.map((s) => (
          <section key={s.grupo}>
            <div className="mb-3">
              <h2 className="text-lg font-bold text-gray-900">{s.grupo}</h2>
              <p className="text-sm text-gray-500">{s.intro}</p>
            </div>
            <div className="space-y-2">
              {s.ferramentas.map((f) => (
                <div key={f.rota} className="border border-gray-200 p-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="font-semibold text-gray-900">{f.nome}</h3>
                    <Link href={f.rota} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 shrink-0">
                      Abrir <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  <p className="text-sm text-gray-700"><span className="font-semibold text-gray-500">Para que serve:</span> {f.paraQue}</p>
                  <p className="text-sm text-gray-700 mt-1"><span className="font-semibold text-gray-500">Como usar:</span> {f.comoUsar}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
        {secoes.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400 border border-dashed border-gray-200">
            Nada encontrado para “{busca}”.
          </div>
        )}
      </div>
    </div>
  );
}
