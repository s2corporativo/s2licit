/**
 * propostaAgent.ts
 * Agente universal de preenchimento de propostas em portais de licitação.
 *
 * Portais suportados com seletores reais:
 *   - ComprasNet / Compras.gov.br  (Federal)
 *   - ComprasMG                     (Minas Gerais / CAGEF)
 *   - Fundep / Portal de Compras    (UFMG)
 *   - Agrega                        (Cotações eletrônicas)
 *   - Genérico                      (Adaptativo para qualquer portal)
 *
 * Fluxo: Login → Localizar licitação → Ler itens → Buscar preços S2 → Preencher → Screenshot → Aguardar aprovação → Enviar
 */

import puppeteer, { Browser, Page } from "puppeteer";
import { getDb } from "../db";
import { proposals, proposalItems } from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";
import { decryptPassword } from "../utils/encryption";
import { assertSafeExternalUrl } from "../utils/urlGuard";
import {
  puppeteerCookiesToRecord,
  recordToPuppeteerCookies,
} from "./sessionCookies";
import { logger } from "../_core/logger";

// ─── Conformidade: detecção de CAPTCHA (sem resolução) ─────────────────────────
//
// Por conformidade (spec §3 e §17: "não deverá tentar burlar CAPTCHA … deverá
// solicitar intervenção manual"), o agente NÃO resolve desafios anti-robô.
// Esta função apenas IDENTIFICA a presença de um desafio para que o fluxo
// interrompa e exija login manual. É pura (recebe o texto da página) para ser
// testável sem navegador.
export function detectarDesafioCaptcha(textoPagina: string): {
  detectado: boolean;
  tipo?: "captcha_matematico" | "recaptcha" | "hcaptcha" | "captcha";
} {
  const texto = textoPagina ?? "";
  const t = texto.toLowerCase();
  // CAPTCHA matemático (ex.: "Quanto é 6 - 4?")
  if (/quanto\s+[eé]\s+\d+\s*[+\-*x×]\s*\d+/i.test(texto)) {
    return { detectado: true, tipo: "captcha_matematico" };
  }
  if (t.includes("recaptcha")) return { detectado: true, tipo: "recaptcha" };
  if (t.includes("hcaptcha")) return { detectado: true, tipo: "hcaptcha" };
  if (
    t.includes("não sou um robô") ||
    t.includes("nao sou um robo") ||
    t.includes("captcha") ||
    t.includes("código de verificação") ||
    t.includes("codigo de verificacao")
  ) {
    return { detectado: true, tipo: "captcha" };
  }
  return { detectado: false };
}

/** Erro sinalizando que um desafio de segurança exige intervenção humana. */
export class CaptchaRequerIntervencaoError extends Error {
  readonly requerIntervencaoHumana = true;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "CaptchaRequerIntervencaoError";
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PortalType = "comprasnet" | "comprasmg" | "fundep" | "funarbe" | "copasa" | "fiemg" | "cemig" | "agrega" | "generico";

export interface PortalConfig {
  nome: string;
  loginUrl: string;
  notasImportantes?: string;
  estrategia: "linha_por_linha" | "form_padrao" | "modal" | "spa";
  seletores: {
    loginCpfCnpj?: string;
    loginSenha: string;
    loginBotao: string;
    loginSucesso?: string;
    buscaProcesso?: string;
    buscaBotao?: string;
    tabelaItens?: string;
    inputPreco?: string;
    inputMarca?: string;
    inputValidade?: string;
    botaoSalvar?: string;
    botaoEnviar?: string;
    confirmacaoEnvio?: string;
  };
}

export interface PortalCredential {
  portal: PortalType;
  loginUrl?: string;
  email: string;
  password: string;
  cpf?: string;
  cnpj?: string;
}

export interface ItemProposta {
  numero: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  precoTotal: number;
  validade?: number;
  marca?: string;
}

export interface ResultadoAgente {
  sucesso: boolean;
  portalUsado: PortalType;
  itensTentados: number;
  itensPreenchidos: number;
  itensComErro: number;
  screenshots: string[];
  log: string[];
  erros: string[];
  aguardandoAprovacao: boolean;
  resumo: {
    processo: string;
    orgao: string;
    totalProposta: number;
    validadeDias: number;
  };
}

// ─── Configurações reais de cada portal ───────────────────────────────────────

export const PORTAL_CONFIGS: Record<PortalType, PortalConfig> = {

  // ── ComprasNet / Compras.gov.br (Federal) ─────────────────────────────────
  // Documentação oficial: gov.br/compras/pt-br/acesso-a-informacao/perguntas-frequentes
  // Login: txtLogin (usuário criado no SICAF, não é CNPJ direto) + txtSenha
  // Fluxo: Login → Serviços do Fornecedor → Pregão Eletrônico → Proposta → Cadastrar/Excluir
  // Campos de preço: txtPrecoUnitario_N (índice por item), txtMarca_N, txtValidade
  comprasnet: {
    nome: "ComprasNet / Compras.gov.br (Federal)",
    loginUrl: "https://www.comprasnet.gov.br/seguro/loginPortal.asp",
    notasImportantes:
      "O campo 'Login' é o usuário criado no SICAF (não o CNPJ). " +
      "Após login, navegue: Serviços do Fornecedor → Pregão Eletrônico → Proposta → Cadastrar/Excluir. " +
      "Informe o número do pregão (UASG + número) para localizar a licitação.",
    estrategia: "linha_por_linha",
    seletores: {
      // Campos reais do ComprasNet ASP clássico
      loginCpfCnpj: '#txtLogin, input[name="txtLogin"]',
      loginSenha: '#txtSenha, input[name="txtSenha"]',
      loginBotao: '#btnAcessar, input[name="btnAcessar"], input[value="Acessar"], input[type="submit"]',
      loginSucesso: "Servi",

      // Busca do pregão por número
      buscaProcesso: '#txtNumPregao, input[name="txtNumPregao"], input[name="numPregao"], input[name="nrPregao"]',
      buscaBotao: '#btnPesquisar, input[name="btnPesquisar"], input[value="Pesquisar"]',

      // Tabela de itens — ComprasNet usa ASP.NET GridView
      tabelaItens: 'table#grdItens tr[class*="Grid"], table.gridLista tbody tr, tr.itemGrid, table[id*="grd"] tr',

      // Campos de preço com ID dinâmico por índice de item
      // ComprasNet: txtPrecoUnitario_0, txtPrecoUnitario_1, ...
      inputPreco: 'input[id*="PrecoUnitario"], input[id*="precoUnit"], input[name*="precoUnit"], input[id*="Preco"][id$="0"], input[id*="Preco"]',
      inputMarca: 'input[id*="Marca"], input[id*="marca"], input[name*="marca"]',
      inputValidade: 'input[id*="Validade"], input[id*="validade"], input[name*="validade"], input[id*="Prazo"]',

      botaoSalvar: '#btnSalvarProposta, #btnSalvar, input[id="btnSalvar"], input[value="Salvar Proposta"], input[value="Salvar"]',
      botaoEnviar: '#btnEnviarProposta, #btnEnviar, input[id="btnEnviar"], input[value="Enviar Proposta"]',
      confirmacaoEnvio: '#btnConfirmar, input[value="Confirmar"], input[value="OK"], button:contains("Confirmar")',
    },
  },

  // ── ComprasMG (Estado de Minas Gerais) ────────────────────────────────────
  // Login: CNPJ + senha cadastrada no CAGEF (Cadastro Geral de Fornecedores MG)
  // URL: www1.compras.mg.gov.br — sistema Java com JSF
  // Fluxo: Login → Menu Procedimento Eletrônico → Localizar → Aba Proposta → Inserir preços por lote
  comprasmg: {
    nome: "ComprasMG / Portal de Compras MG",
    loginUrl: "https://www1.compras.mg.gov.br/fornecedor/login.html",
    notasImportantes:
      "Login com CNPJ e senha cadastrada no CAGEF. " +
      "Após login: Menu → Procedimento Eletrônico → buscar pelo número. " +
      "Aba 'Proposta' → preencher preços por lote/item.",
    estrategia: "linha_por_linha",
    seletores: {
      // Portal ComprasMG — sistema Java (JSF/PrimeFaces)
      loginCpfCnpj: '#cnpj, input[name="cnpj"], input[id*="cnpj"], input[placeholder*="CNPJ"]',
      loginSenha: '#senha, input[name="senha"], input[type="password"]',
      loginBotao: '#btnEntrar, button[id*="entrar"], button[type="submit"], input[value="Entrar"]',
      loginSucesso: "fornecedor",

      buscaProcesso: '#numeroProcedimento, input[id*="numero"], input[placeholder*="número do procedimento"]',
      buscaBotao: '#btnBuscar, button[id*="buscar"], button[type="submit"]',

      // Tabela JSF/PrimeFaces de itens
      tabelaItens: 'table[id*="tblItens"] tr, table[id*="itens"] tbody tr, .lote-item, [id*="itemRow"]',

      inputPreco: 'input[id*="precoUnitario"], input[id*="valorUnitario"], input[name*="precoUnit"], input[id*="preco"]',
      inputMarca: 'input[id*="marca"], input[id*="fabricante"], input[name*="marca"]',
      inputValidade: 'input[id*="validade"], input[id*="prazoValidade"], select[id*="validade"]',

      botaoSalvar: 'button[id*="salvar"], button[value*="Salvar"], input[value*="Salvar Proposta"]',
      botaoEnviar: 'button[id*="enviarProposta"], button[id*="enviar"], input[value*="Enviar Proposta"]',
      confirmacaoEnvio: 'button[id*="confirmar"], input[value="Confirmar"]',
    },
  },

  // ── Fundep / Portal de Compras UFMG ──────────────────────────────────────
  // Login: portaldecompras.fundep.ufmg.br/Publico/Login.aspx
  // Credencial: Login (gerado pela Fundep, pode ser CNPJ) + senha
  // ATENÇÃO: possui CAPTCHA matemático simples — "Quanto é X - Y?".
  // Por conformidade, o agente NÃO resolve o CAPTCHA: detecta e exige login manual.
  // Fluxo: Login → Cotações em andamento → Selecionar cotação → Inserir preços por item → Enviar
  fundep: {
    nome: "Fundep / Portal de Compras UFMG",
    loginUrl: "https://portaldecompras.fundep.ufmg.br/Publico/Login.aspx",
    notasImportantes:
      "Login com código de usuário (pode ser CNPJ) e senha enviada por e-mail pela Fundep. " +
      "Portal tem CAPTCHA matemático (ex: 'Quanto é 6 - 4?'); por conformidade o agente NÃO o resolve — " +
      "detecta o desafio e exige que o login seja feito manualmente. " +
      "Fluxo: Login → cotações em andamento → selecionar → inserir preços.",
    estrategia: "linha_por_linha",
    seletores: {
      // Campos reais do portal ASP.NET da Fundep (confirmados na documentação oficial)
      loginCpfCnpj: '#txtLogin, input[id="txtLogin"], input[name*="Login"]',
      loginSenha: '#txtSenha, input[id="txtSenha"], input[name*="Senha"], input[type="password"]',
      loginBotao: '#btnEntrar, input[id="btnEntrar"], input[value="Entrar"], input[type="submit"]',
      loginSucesso: "Fornecedor",

      // Listagem de cotações
      buscaProcesso: '#txtNumCotacao, input[id*="NumCotacao"], input[name*="numCotacao"]',
      buscaBotao: '#btnBuscar, input[value="Buscar"]',

      // GridView ASP.NET com linha por item
      tabelaItens: 'table[id*="grdItens"] tr, table[id*="Grid"] tr[class*="Row"], tr[class="linhaGrid"]',

      // Campos de preço por item na grid
      inputPreco: 'input[id*="PrecoUnitario"], input[id*="txtPreco"], input[name*="preco"]',
      inputMarca: 'input[id*="Marca"], input[id*="txtMarca"], input[name*="marca"]',
      inputValidade: 'input[id*="Validade"], select[id*="Validade"], input[name*="validade"]',

      botaoSalvar: '#btnSalvar, input[id="btnSalvar"], input[value="Salvar"]',
      botaoEnviar: '#btnEnviarProposta, input[id*="Enviar"], input[value="Enviar Proposta"]',
      confirmacaoEnvio: '#btnConfirmar, input[value="Confirmar"]',
    },
  },

  // ── FUNARBE (Fundação Arthur Bernardes / UFV Viçosa-MG) ───────────────────
  // Portal: compras.funarbe.org.br — cotações, pregões e dispensas.
  // Login do fornecedor + senha cadastrada na Funarbe.
  funarbe: {
    nome: "FUNARBE / Compras Funarbe (UFV)",
    loginUrl: "https://compras.funarbe.org.br/",
    notasImportantes:
      "Portal de compras da Fundação Arthur Bernardes (UFV, Viçosa-MG). " +
      "Acesse 'Portal do Fornecedor', faça login e localize a cotação/pregão em andamento. " +
      "Confira os seletores na primeira execução — o robô loga e pré-preenche; você revisa e envia.",
    estrategia: "form_padrao",
    seletores: {
      loginCpfCnpj: 'input[name*="login"], input[name*="cnpj"], input[name="email"], input[id*="login"], input[placeholder*="CNPJ"], input[placeholder*="usu"]',
      loginSenha: 'input[type="password"], input[name*="senha"], input[name="password"]',
      loginBotao: 'button[type="submit"], input[type="submit"], input[value="Entrar"], input[value="Acessar"]',
      loginSucesso: "fornecedor",
      tabelaItens: 'table tbody tr, .item-cotacao, tr[class*="item"], [class*="linha-item"]',
      inputPreco: 'input[name*="preco"], input[name*="valor"], input[id*="preco"], input[type="number"]',
      inputMarca: 'input[name*="marca"], input[id*="marca"], input[name*="fabricante"]',
      inputValidade: 'input[name*="validade"], input[id*="validade"], input[name*="prazo"]',
      botaoSalvar: 'button[id*="salvar"], input[value*="Salvar"], button[type="submit"]',
      botaoEnviar: 'button[id*="enviar"], input[value*="Enviar"]',
      confirmacaoEnvio: 'button[id*="confirmar"], input[value="Confirmar"], input[value="OK"]',
    },
  },

  // ── COPASA (Cia. de Saneamento de MG) — Agência Virtual ───────────────────
  // Portal: copasaportalprd.azurewebsites.net (ASP.NET). Login do fornecedor.
  copasa: {
    nome: "COPASA / Agência Virtual",
    loginUrl: "https://copasaportalprd.azurewebsites.net/Copasa.Portal/Login/index",
    notasImportantes:
      "Agência Virtual da COPASA (fornecedores). Faça login e acesse a área de " +
      "abastecimento/cotações. Portal ASP.NET — confira os seletores na 1ª execução. " +
      "O robô loga e pré-preenche; você revisa e envia.",
    estrategia: "form_padrao",
    seletores: {
      loginCpfCnpj: 'input[name*="Login"], input[name*="User"], input[name*="cnpj"], input[name*="cpf"], input[id*="Login"], input[id*="User"]',
      loginSenha: 'input[type="password"], input[name*="Password"], input[name*="Senha"], input[id*="Password"]',
      loginBotao: 'button[type="submit"], input[type="submit"], input[value="Entrar"], input[value="Acessar"], #btnLogin',
      loginSucesso: "home",
      tabelaItens: 'table tbody tr, .grid-row, tr[class*="row"], [class*="item"]',
      inputPreco: 'input[name*="Preco"], input[name*="Valor"], input[id*="Preco"], input[type="number"]',
      inputMarca: 'input[name*="Marca"], input[id*="Marca"], input[name*="Fabricante"]',
      inputValidade: 'input[name*="Validade"], input[id*="Validade"], input[name*="Prazo"]',
      botaoSalvar: 'button[id*="Salvar"], input[value*="Salvar"], button[type="submit"]',
      botaoEnviar: 'button[id*="Enviar"], input[value*="Enviar"]',
      confirmacaoEnvio: 'button[id*="Confirmar"], input[value="Confirmar"], input[value="OK"]',
    },
  },

  // ── FIEMG / SESI / SENAI (Sistema FIEMG) ──────────────────────────────────
  // Portal: compras.fiemg.com.br — mural público + área do fornecedor (ASP.NET).
  // Login do fornecedor cadastrado no portal de compras do Sistema FIEMG.
  fiemg: {
    nome: "FIEMG / SESI / SENAI (Sistema FIEMG)",
    loginUrl: "https://compras.fiemg.com.br/portal/",
    notasImportantes:
      "Portal de compras do Sistema FIEMG (FIEMG, SESI, SENAI, IEL, CIEMG). " +
      "O mural de processos é público; a participação exige login do fornecedor. " +
      "Portal ASP.NET — confira os seletores na primeira execução. " +
      "O robô loga e pré-preenche; você revisa e envia.",
    estrategia: "form_padrao",
    seletores: {
      loginCpfCnpj: 'input[name*="Login"], input[name*="Usuario"], input[id*="Login"], input[id*="Usuario"], input[name*="cnpj"], input[placeholder*="CNPJ"], input[placeholder*="usu"]',
      loginSenha: 'input[type="password"], input[name*="Senha"], input[id*="Senha"]',
      loginBotao: 'button[type="submit"], input[type="submit"], input[value="Entrar"], input[value="Acessar"], input[id*="btnLogin"], #btnEntrar',
      loginSucesso: "fornecedor",
      buscaProcesso: 'input[id*="Processo"], input[name*="processo"], input[id*="Numero"], input[name*="numero"]',
      buscaBotao: 'input[value="Pesquisar"], button[id*="pesquisar"], input[id*="btnPesquisar"]',
      tabelaItens: 'table[id*="grd"] tr, table tbody tr, tr[class*="Grid"], [class*="item"]',
      inputPreco: 'input[id*="Preco"], input[name*="preco"], input[id*="Valor"], input[name*="valor"], input[type="number"]',
      inputMarca: 'input[id*="Marca"], input[name*="marca"], input[name*="fabricante"]',
      inputValidade: 'input[id*="Validade"], input[name*="validade"], input[name*="prazo"]',
      botaoSalvar: 'input[value*="Salvar"], button[id*="salvar"], button[type="submit"]',
      botaoEnviar: 'input[value*="Enviar"], button[id*="enviar"]',
      confirmacaoEnvio: 'input[value="Confirmar"], button[id*="confirmar"], input[value="OK"]',
    },
  },

  // ── CEMIG (Portal de Compras) ──────────────────────────────────────────────
  // Configuração base; a instância real usada em runtime é a de
  // s2PortalAgentExtension.ts (importada por efeito colateral pelos serviços
  // que precisam dela), mantida aqui apenas para tipagem completa e testes.
  cemig: {
    nome: "CEMIG / Portal de Compras",
    loginUrl: "https://minhaconta-compras.cemig.com.br/",
    notasImportantes:
      "A pesquisa pública ocorre em app2-compras.cemig.com.br/pesquisa. " +
      "Para participar, utilize o login cadastrado no Portal de Compras da CEMIG. " +
      "O agente apenas pré-preenche e interrompe diante de CAPTCHA, 2FA ou confirmação final.",
    estrategia: "spa",
    seletores: {
      loginCpfCnpj:
        'input[name*="login"], input[name*="usuario"], input[name*="cnpj"], input[id*="login"], input[id*="usuario"], input[placeholder*="CNPJ"]',
      loginSenha:
        'input[type="password"], input[name*="senha"], input[name*="password"], input[id*="senha"]',
      loginBotao:
        'button[type="submit"], button[id*="entrar"], button[id*="login"], input[type="submit"], input[value*="Entrar"]',
      loginSucesso: "fornecedor",
      buscaProcesso:
        'input[name*="processo"], input[id*="processo"], input[placeholder*="processo"], input[placeholder*="licitação"]',
      buscaBotao: 'button[id*="buscar"], button[id*="pesquisar"], button[type="submit"]',
      tabelaItens: 'table tbody tr, [role="row"], [class*="item"], [class*="lote"]',
      inputPreco: 'input[name*="preco"], input[name*="valor"], input[id*="preco"], input[id*="valor"], input[type="number"]',
      inputMarca: 'input[name*="marca"], input[id*="marca"], input[name*="fabricante"]',
      inputValidade: 'input[name*="validade"], input[id*="validade"], input[name*="prazo"]',
      botaoSalvar: 'button[id*="salvar"], button[type="submit"], input[value*="Salvar"]',
      botaoEnviar: 'button[id*="enviar"], button[id*="submeter"], input[value*="Enviar"]',
      confirmacaoEnvio: 'button[id*="confirmar"], input[value="Confirmar"], button[id*="confirmarEnvio"]',
    },
  },

  // ── Agrega (sistema de cotações eletrônicas) ──────────────────────────────
  // Plataforma usada por múltiplos órgãos públicos para cotações via web
  // Login: CNPJ + senha da empresa cadastrada
  // A URL pode variar por órgão — sempre usar a URL direta da cotação
  agrega: {
    nome: "Agrega (Cotações Eletrônicas)",
    loginUrl: "https://www.agrega.com.br/fornecedor",
    notasImportantes:
      "Plataforma de cotações eletrônicas para órgãos públicos. " +
      "Login com CNPJ e senha. Recomenda-se informar a URL direta da cotação. " +
      "A URL base pode variar por organização (ex: orgao.agrega.com.br).",
    estrategia: "form_padrao",
    seletores: {
      loginCpfCnpj: 'input[name="cnpj"], input[id*="cnpj"], input[placeholder*="CNPJ"], input[name="login"]',
      loginSenha: 'input[name="senha"], input[name="password"], input[type="password"]',
      loginBotao: 'button[type="submit"], input[type="submit"], input[value="Entrar"], input[value="Acessar"]',
      loginSucesso: "cotacao",

      tabelaItens: 'table.itens tbody tr, .item-cotacao, table tbody tr[id*="item"], tr.itemRow',

      inputPreco: 'input[name*="preco"], input[id*="preco"], input[name*="valor"], input[name*="unitario"]',
      inputMarca: 'input[name*="marca"], input[id*="marca"], input[name*="fabricante"]',
      inputValidade: 'input[name*="validade"], select[name*="validade"], input[name*="prazo"]',

      botaoSalvar: 'button[id*="salvar"], input[value*="Salvar"]',
      botaoEnviar: 'button[id*="enviar"], input[value*="Enviar"]',
      confirmacaoEnvio: 'button[id*="confirmar"], input[value="OK"], input[value="Confirmar"]',
    },
  },

  // ── Genérico — adaptativo ─────────────────────────────────────────────────
  generico: {
    nome: "Portal Genérico (adaptativo)",
    loginUrl: "",
    notasImportantes:
      "Modo universal para qualquer portal não listado. " +
      "Informe obrigatoriamente a URL de login e a URL direta da licitação para melhor resultado. " +
      "O agente tentará identificar os campos automaticamente.",
    estrategia: "linha_por_linha",
    seletores: {
      loginCpfCnpj: [
        'input[name="login"]', 'input[name="cnpj"]', 'input[name="email"]',
        'input[id*="login"]', 'input[id*="Login"]', 'input[id*="cnpj"]',
        'input[type="text"]:first-of-type',
      ].join(", "),
      loginSenha: 'input[type="password"]',
      loginBotao: 'button[type="submit"], input[type="submit"], input[value="Entrar"], input[value="Acessar"]',

      tabelaItens: 'table tbody tr, .item, [class*="item-row"], [class*="linha-item"]',

      inputPreco: [
        'input[name*="preco"]', 'input[name*="valor"]', 'input[name*="price"]',
        'input[id*="preco"]', 'input[id*="Preco"]', 'input[id*="valor"]',
        'input[type="number"]',
      ].join(", "),
      inputMarca: 'input[name*="marca"], input[id*="marca"], input[name*="fabricante"]',
      inputValidade: 'input[name*="validade"], input[id*="validade"], input[name*="prazo"]',
      botaoSalvar: 'input[value*="Salvar"], button[id*="salvar"], button[type="submit"]',
      botaoEnviar: 'input[value*="Enviar"], button[id*="enviar"]',
    },
  },
};

// ─── Motor do Agente de Proposta ──────────────────────────────────────────────

export class PropostaAgente {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private log: string[] = [];
  private screenshots: string[] = [];
  private erros: string[] = [];

  private addLog(msg: string) {
    const ts = new Date().toISOString().slice(11, 19);
    this.log.push(`[${ts}] ${msg}`);
    logger.info(`[PropostaAgente] ${msg}`);
  }

  private addErro(msg: string) {
    this.erros.push(msg);
    this.addLog(`❌ ERRO: ${msg}`);
  }

  private async capturarTela(descricao: string): Promise<void> {
    if (!this.page) return;
    try {
      const buf = await this.page.screenshot({ fullPage: false, encoding: "base64" }) as string;
      this.screenshots.push(buf);
      this.addLog(`📸 Screenshot: ${descricao}`);
    } catch {}
  }

  async init(): Promise<void> {
    if (this.browser) return;
    this.addLog("Iniciando navegador...");
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu",
        "--single-process", "--no-zygote",
      ],
    });
  }

  async fechar(): Promise<void> {
    // try/catch separados: se o page.close() falhar, o browser ainda é
    // encerrado (senão o processo do Chromium vaza a cada erro).
    try {
      if (this.page) { await this.page.close(); }
    } catch {}
    this.page = null;
    try {
      if (this.browser) { await this.browser.close(); }
    } catch {}
    this.browser = null;
  }

  private async esperarElemento(seletores: string, timeout = 10000): Promise<boolean> {
    if (!this.page) return false;
    const lista = seletores.split(",").map(s => s.trim()).filter(Boolean);
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      for (const sel of lista) {
        try {
          const el = await this.page.$(sel);
          if (el) return true;
        } catch {}
      }
      await new Promise(r => setTimeout(r, 400));
    }
    return false;
  }

  private async clicarSeguro(seletor: string): Promise<boolean> {
    if (!this.page) return false;
    const lista = seletor.split(",").map(s => s.trim()).filter(Boolean);
    for (const sel of lista) {
      try {
        const el = await this.page.$(sel);
        if (el) { await el.click(); return true; }
      } catch {}
    }
    return false;
  }

  private async preencherCampo(seletor: string, valor: string): Promise<boolean> {
    if (!this.page) return false;
    const lista = seletor.split(",").map(s => s.trim()).filter(Boolean);
    for (const sel of lista) {
      try {
        const el = await this.page.$(sel);
        if (el) {
          await el.click({ clickCount: 3 });
          await el.type(valor, { delay: 60 });
          return true;
        }
      } catch {}
    }
    return false;
  }

  // Conformidade (§3, §17): detecta CAPTCHA e EXIGE intervenção humana — nunca
  // tenta resolver/burlar o desafio. Se houver desafio, interrompe o fluxo.
  private async verificarCaptcha(portalNome: string): Promise<void> {
    if (!this.page) return;
    let texto = "";
    try {
      texto = await this.page.evaluate(() => document.body?.innerText ?? "");
    } catch {
      return;
    }
    const captcha = detectarDesafioCaptcha(texto);
    if (!captcha.detectado) return;

    await this.capturarTela("CAPTCHA detectado — intervenção humana necessária");
    const msg =
      `CAPTCHA detectado no portal ${portalNome} (${captcha.tipo}). ` +
      `Por conformidade, a automação não resolve desafios de segurança. ` +
      `Faça o login manualmente no portal e reexecute, ou utilize a consulta assistida.`;
    this.addLog(`🚫 ${msg}`);
    this.erros.push(msg);
    throw new CaptchaRequerIntervencaoError(msg);
  }

  async login(cred: PortalCredential): Promise<void> {
    const cfg = PORTAL_CONFIGS[cred.portal];
    if (!this.browser) await this.init();

    this.page = await this.browser!.newPage();
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await this.page.setViewport({ width: 1366, height: 768 });

    const url = cred.loginUrl || cfg.loginUrl;
    this.addLog(`🌐 Acessando ${cfg.nome}...`);
    assertSafeExternalUrl(url, "URL do portal");
    await this.page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));

    // Conformidade: se houver CAPTCHA, interrompe e exige intervenção humana.
    await this.verificarCaptcha(cfg.nome);

    const loginSel = cfg.seletores.loginCpfCnpj || 'input[type="text"]';
    const encontrou = await this.esperarElemento(loginSel, 10000);
    if (!encontrou) throw new Error(`Campo de login não encontrado. Verifique a URL: ${url}`);

    // Usar CPF, CNPJ ou e-mail conforme disponível
    const loginValor = cred.cpf || cred.cnpj || cred.email;
    this.addLog(`🔑 Preenchendo credenciais (${cred.portal})...`);
    await this.preencherCampo(loginSel, loginValor);
    await new Promise(r => setTimeout(r, 400));
    await this.preencherCampo(cfg.seletores.loginSenha, cred.password);
    await new Promise(r => setTimeout(r, 300));

    // Alguns portais só exibem o CAPTCHA após o preenchimento — verifica de novo.
    await this.verificarCaptcha(cfg.nome);

    await Promise.all([
      this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
      this.clicarSeguro(cfg.seletores.loginBotao),
    ]);
    await new Promise(r => setTimeout(r, 2000));

    const urlAtual = this.page.url();
    const textoPage = await this.page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    const errosSenha = ["senha incorreta", "usuário inválido", "acesso negado", "login inválido", "credenciais inválidas", "senha inválida"];
    const temErro = errosSenha.some(e => textoPage.toLowerCase().includes(e));

    if (temErro) {
      await this.capturarTela("Falha no login");
      throw new Error(`Login falhou: credenciais incorretas no portal ${cfg.nome}`);
    }

    // Confirmação positiva: indicador de sucesso na página OU URL mudou.
    // Sem isso, CAPTCHA/manutenção/layout novo passavam como "login ok".
    const indicador = cfg.seletores.loginSucesso?.toLowerCase();
    const sucessoIndicado = indicador ? textoPage.toLowerCase().includes(indicador) : false;
    const urlMudou = urlAtual !== url;
    if (!sucessoIndicado && !urlMudou) {
      await this.capturarTela("Login não confirmado");
      throw new Error(
        `Não foi possível confirmar o login no portal ${cfg.nome} — ` +
          `indicador de sucesso ausente e a URL não mudou (CAPTCHA? layout novo? credenciais?).`,
      );
    }

    this.addLog(`✅ Login realizado. URL: ${urlAtual}`);
    await this.capturarTela("Após login");
  }

  /**
   * Após o login, navega até uma URL do portal e devolve o HTML renderizado.
   * Usado pela descoberta autenticada de cotações (radar com credencial do
   * cofre): o HTML retornado passa pelos mesmos parsers do radar público.
   * Mantém a conformidade do agente — se um CAPTCHA aparecer na navegação,
   * o fluxo é interrompido e exige intervenção humana.
   */
  async coletarHtml(urlAlvo: string): Promise<string> {
    if (!this.page) throw new Error("Não autenticado: faça login antes de coletar páginas.");
    assertSafeExternalUrl(urlAlvo, "URL do portal");
    this.addLog(`📄 Coletando página autenticada: ${urlAlvo}`);
    await this.page.goto(urlAlvo, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise(r => setTimeout(r, 1500));
    await this.verificarCaptcha(urlAlvo);
    return this.page.content();
  }

  /**
   * Exporta os cookies da sessão atual (formato nome→valor) para reuso em uma
   * execução futura sem repetir o login.
   */
  async exportarCookies(): Promise<Record<string, string>> {
    if (!this.page) return {};
    try {
      const cookies = await this.page.cookies();
      return puppeteerCookiesToRecord(cookies);
    } catch {
      return {};
    }
  }

  /**
   * Tenta restaurar uma sessão salva (cookies) em vez de logar de novo:
   * abre a página, aplica os cookies e navega até `url`. Retorna true se o
   * indicador de sucesso do portal aparecer — nesse caso, `login()` pode ser
   * pulado. Retorna false (sem lançar) em qualquer falha, para que o chamador
   * caia no login completo normalmente.
   */
  async restaurarSessao(
    cred: PortalCredential,
    cookies: Record<string, string>,
    url: string,
  ): Promise<boolean> {
    if (Object.keys(cookies).length === 0) return false;
    try {
      if (!this.browser) await this.init();
      this.page = await this.browser!.newPage();
      await this.page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );
      await this.page.setViewport({ width: 1366, height: 768 });

      assertSafeExternalUrl(url, "URL do portal");
      await this.page.setCookie(...recordToPuppeteerCookies(cookies, url));
      await this.page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1200));

      const cfg = PORTAL_CONFIGS[cred.portal];
      const textoPage = await this.page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      const indicador = cfg.seletores.loginSucesso?.toLowerCase();
      const restaurada = indicador ? textoPage.toLowerCase().includes(indicador) : false;
      if (restaurada) this.addLog(`♻️ Sessão restaurada sem novo login (${cfg.nome}).`);
      return restaurada;
    } catch (err) {
      logger.warn(`[PropostaAgente] Falha ao restaurar sessão: ${(err as Error).message}`);
      return false;
    }
  }

  async navegarParaLicitacao(numeroProcesso: string, urlDireta?: string): Promise<void> {
    if (!this.page) throw new Error("Não autenticado");

    if (urlDireta) {
      this.addLog(`🔗 Acessando URL direta...`);
      assertSafeExternalUrl(urlDireta, "URL do portal");
      await this.page.goto(urlDireta, { waitUntil: "networkidle2", timeout: 30000 });
    } else if (numeroProcesso) {
      this.addLog(`🔍 Buscando processo: ${numeroProcesso}`);
      const buscaSel = 'input[name*="processo"], input[name*="numero"], input[placeholder*="processo"], input[placeholder*="número"], input[id*="numero"]';
      const achou = await this.esperarElemento(buscaSel, 5000);
      if (achou) {
        await this.preencherCampo(buscaSel, numeroProcesso);
        await new Promise(r => setTimeout(r, 300));
        await this.clicarSeguro('button[type="submit"], input[type="submit"], input[value*="Buscar"], input[value*="Pesquisar"]');
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    await this.capturarTela(`Licitação localizada`);
    this.addLog(`📋 Página da licitação carregada`);
  }

  async preencherItens(
    itens: ItemProposta[],
    portalType: PortalType,
    validadeDias: number
  ): Promise<{ preenchidos: number; erros: number }> {
    if (!this.page) throw new Error("Não autenticado");
    const cfg = PORTAL_CONFIGS[portalType];

    let preenchidos = 0;
    let comErro = 0;

    this.addLog(`📝 Preenchendo ${itens.length} itens...`);

    // Aguardar tabela de itens aparecer
    if (cfg.seletores.tabelaItens) {
      await this.esperarElemento(cfg.seletores.tabelaItens, 8000);
    }

    const linhasSel = cfg.seletores.tabelaItens || "table tbody tr";
    const linhas = await this.page.$$(linhasSel).catch(() => []);
    this.addLog(`📊 ${linhas.length} linhas detectadas`);

    // Buscar todos os inputs de preço da página de uma vez
    const todosInputsPreco = cfg.seletores.inputPreco
      ? await this.page.$$(cfg.seletores.inputPreco).catch(() => [])
      : [];

    for (const item of itens) {
      try {
        this.addLog(`  → Item ${item.numero}: ${item.descricao.slice(0, 45)}...`);

        const valorBR = item.precoUnitario.toFixed(2).replace(".", ",");
        let preencheu = false;

        // Estratégia 1: input na linha correspondente
        const linhaAtual = linhas[item.numero - 1];
        if (linhaAtual && cfg.seletores.inputPreco) {
          const inputsNaLinha = await linhaAtual.$$(cfg.seletores.inputPreco).catch(() => []);
          if (inputsNaLinha.length > 0) {
            await inputsNaLinha[0].click({ clickCount: 3 });
            await inputsNaLinha[0].type(valorBR, { delay: 60 });
            preencheu = true;

            // Marca
            if (cfg.seletores.inputMarca && item.marca) {
              const marcaInps = await linhaAtual.$$(cfg.seletores.inputMarca).catch(() => []);
              if (marcaInps[0]) {
                await marcaInps[0].click({ clickCount: 3 });
                await marcaInps[0].type(item.marca, { delay: 50 });
              }
            }
          }
        }

        // Estratégia 2: input pelo índice global na página
        if (!preencheu && todosInputsPreco[item.numero - 1]) {
          const inp = todosInputsPreco[item.numero - 1];
          await inp.click({ clickCount: 3 });
          await inp.type(valorBR, { delay: 60 });
          preencheu = true;
        }

        if (!preencheu) {
          this.addLog(`    ⚠️  Campo de preço não encontrado para item ${item.numero}`);
          comErro++;
          continue;
        }

        await this.page.keyboard.press("Tab");
        await new Promise(r => setTimeout(r, 350));

        preenchidos++;
        this.addLog(`    ✅ R$ ${item.precoUnitario.toFixed(2).replace(".", ",")} → ${item.descricao.slice(0, 30)}`);

      } catch (err: any) {
        comErro++;
        this.addErro(`Item ${item.numero}: ${err?.message}`);
      }
    }

    // Validade global
    if (cfg.seletores.inputValidade) {
      await this.preencherCampo(cfg.seletores.inputValidade, String(validadeDias));
      this.addLog(`📅 Validade: ${validadeDias} dias`);
    }

    await this.capturarTela("Itens preenchidos");
    this.addLog(`✅ ${preenchidos} preenchidos, ${comErro} com erro`);
    return { preenchidos, erros: comErro };
  }

  async salvarRascunho(portalType: PortalType): Promise<void> {
    if (!this.page || !PORTAL_CONFIGS[portalType].seletores.botaoSalvar) return;
    this.addLog(`💾 Salvando rascunho...`);
    await this.clicarSeguro(PORTAL_CONFIGS[portalType].seletores.botaoSalvar!);
    await new Promise(r => setTimeout(r, 2000));
    await this.capturarTela("Rascunho salvo");
    this.addLog(`✅ Rascunho salvo — aguardando aprovação`);
  }

  async enviarProposta(portalType: PortalType): Promise<void> {
    if (!this.page) throw new Error("Página não disponível");
    const cfg = PORTAL_CONFIGS[portalType];
    if (!cfg.seletores.botaoEnviar) throw new Error("Botão de envio não configurado");

    this.addLog(`🚀 Enviando proposta...`);
    this.page.on("dialog", (d: any) => { this.addLog(`💬 ${d.message()}`); d.accept().catch(() => {}); });
    await this.clicarSeguro(cfg.seletores.botaoEnviar);
    await new Promise(r => setTimeout(r, 2000));
    if (cfg.seletores.confirmacaoEnvio) {
      await this.clicarSeguro(cfg.seletores.confirmacaoEnvio).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 3000));
    await this.capturarTela("Confirmação de envio");
    this.addLog(`✅ Proposta enviada!`);
  }

  getLog() { return this.log; }
  getScreenshots() { return this.screenshots; }
  getErros() { return this.erros; }
}

// ─── Execução principal ────────────────────────────────────────────────────────

export async function executarAgenteProposta(params: {
  propostaId: number;
  portalType: PortalType;
  credencial: { email: string; passwordEncrypted: string; cpf?: string; cnpj?: string; loginUrl?: string };
  urlLicitacao?: string;
  modoAprovacao: "salvar_rascunho" | "enviar_direto";
  validadeDias?: number;
}): Promise<ResultadoAgente> {

  const agente = new PropostaAgente();

  const resultado: ResultadoAgente = {
    sucesso: false,
    portalUsado: params.portalType,
    itensTentados: 0, itensPreenchidos: 0, itensComErro: 0,
    screenshots: [], log: [], erros: [],
    aguardandoAprovacao: false,
    resumo: { processo: "", orgao: "", totalProposta: 0, validadeDias: params.validadeDias ?? 60 },
  };

  try {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");

    const [proposta] = await db.select().from(proposals).where(eq(proposals.id, params.propostaId)).limit(1);
    if (!proposta) throw new Error(`Proposta #${params.propostaId} não encontrada`);

    const itensDb = await db.select().from(proposalItems)
      .where(eq(proposalItems.proposalId, params.propostaId))
      .orderBy(asc(proposalItems.sortOrder));

    if (itensDb.length === 0) throw new Error("Proposta sem itens cadastrados");

    resultado.resumo.processo = proposta.processNumber ?? "";
    resultado.resumo.orgao = proposta.orgName ?? "";
    resultado.resumo.validadeDias = params.validadeDias ?? proposta.validityDays ?? 60;

    const itens: ItemProposta[] = itensDb.map((it, idx) => {
      const preco = parseFloat(String(it.suggestedPrice || it.unitPrice || "0"));
      return {
        numero: idx + 1,
        descricao: it.productName,
        quantidade: it.quantity,
        unidade: it.unit ?? "UN",
        precoUnitario: preco,
        precoTotal: preco * it.quantity,
        validade: resultado.resumo.validadeDias,
        marca: (it as any).manufacturer ?? undefined,
      };
    });

    resultado.itensTentados = itens.length;
    resultado.resumo.totalProposta = itens.reduce((s, i) => s + i.precoTotal, 0);

    const senha = decryptPassword(params.credencial.passwordEncrypted);
    await agente.login({
      portal: params.portalType,
      loginUrl: params.credencial.loginUrl,
      email: params.credencial.email,
      password: senha,
      cpf: params.credencial.cpf,
      cnpj: params.credencial.cnpj,
    });

    await agente.navegarParaLicitacao(proposta.processNumber ?? "", params.urlLicitacao);

    const { preenchidos, erros } = await agente.preencherItens(
      itens, params.portalType, resultado.resumo.validadeDias
    );
    resultado.itensPreenchidos = preenchidos;
    resultado.itensComErro = erros;

    if (params.modoAprovacao === "salvar_rascunho") {
      await agente.salvarRascunho(params.portalType);
      resultado.aguardandoAprovacao = true;
    } else {
      await agente.enviarProposta(params.portalType);
    }

    resultado.sucesso = preenchidos > 0;
    resultado.erros = agente.getErros();

  } catch (err: any) {
    resultado.erros.push(err?.message ?? "Erro desconhecido");
  } finally {
    resultado.log = agente.getLog();
    resultado.screenshots = agente.getScreenshots();
    await agente.fechar();
  }

  return resultado;
}

// Jobs em memória
export const propostaJobs = new Map<string, {
  status: "running" | "done" | "error" | "aguardando_aprovacao";
  resultado?: ResultadoAgente;
  criadoEm: Date;
}>();
