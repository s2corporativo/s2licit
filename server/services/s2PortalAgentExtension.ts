import {
  PORTAL_CONFIGS,
  type PortalConfig,
} from "./propostaAgent";
import {
  S2_TARGET_PORTALS,
  type S2TargetPortal,
} from "./s2TargetPortals";

const cemigConfig: PortalConfig = {
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
    buscaBotao:
      'button[id*="buscar"], button[id*="pesquisar"], button[type="submit"]',
    tabelaItens:
      'table tbody tr, [role="row"], [class*="item"], [class*="lote"]',
    inputPreco:
      'input[name*="preco"], input[name*="valor"], input[id*="preco"], input[id*="valor"], input[type="number"]',
    inputMarca:
      'input[name*="marca"], input[id*="marca"], input[name*="fabricante"]',
    inputValidade:
      'input[name*="validade"], input[id*="validade"], input[name*="prazo"]',
    botaoSalvar:
      'button[id*="salvar"], button[type="submit"], input[value*="Salvar"]',
    botaoEnviar:
      'button[id*="enviar"], button[id*="submeter"], input[value*="Enviar"]',
    confirmacaoEnvio:
      'button[id*="confirmar"], input[value="Confirmar"], button[id*="confirmarEnvio"]',
  },
};

const fiemgConfig: PortalConfig = {
  nome: "FIEMG / SESI / SENAI",
  loginUrl: "https://compras.fiemg.com.br/Default.aspx",
  notasImportantes:
    "Portal único do Sistema FIEMG, incluindo FIEMG, CIEMG, SESI/DRMG, SENAI/DRMG e IEL/NRMG. " +
    "O mural público é usado para descoberta; o login do fornecedor é usado somente para pré-preenchimento assistido.",
  estrategia: "linha_por_linha",
  seletores: {
    loginCpfCnpj:
      'input[name*="login"], input[name*="usuario"], input[name*="cnpj"], input[id*="login"], input[id*="usuario"]',
    loginSenha:
      'input[type="password"], input[name*="senha"], input[name*="password"]',
    loginBotao:
      'button[type="submit"], input[type="submit"], input[value*="Entrar"], input[value*="Acessar"]',
    loginSucesso: "fornecedor",
    buscaProcesso:
      'input[name*="processo"], input[name*="numero"], input[id*="processo"], input[id*="numero"]',
    buscaBotao:
      'button[id*="buscar"], input[value*="Pesquisar"], input[value*="Buscar"]',
    tabelaItens:
      'table tbody tr, table[id*="grid"] tr, [class*="item"], [class*="lote"]',
    inputPreco:
      'input[name*="preco"], input[name*="valor"], input[id*="preco"], input[id*="valor"]',
    inputMarca:
      'input[name*="marca"], input[id*="marca"], input[name*="fabricante"]',
    inputValidade:
      'input[name*="validade"], input[id*="validade"], input[name*="prazo"]',
    botaoSalvar:
      'button[id*="salvar"], input[value*="Salvar"], input[type="submit"]',
    botaoEnviar:
      'button[id*="enviar"], input[value*="Enviar"], input[value*="Submeter"]',
    confirmacaoEnvio:
      'button[id*="confirmar"], input[value="Confirmar"], input[value="OK"]',
  },
};

const copasaConfig: PortalConfig = {
  ...PORTAL_CONFIGS.copasa,
  nome: "COPASA / Portal do Fornecedor",
  loginUrl: "https://srm.copasa.com.br/SAP/BC/NWBC",
  notasImportantes:
    "A COPASA utiliza ambiente SAP para fornecedores. Algumas oportunidades são direcionadas a fornecedores convidados. " +
    "O agente não contorna autenticação, convite, CAPTCHA ou confirmação final.",
  estrategia: "spa",
};

export const S2_PORTAL_CONFIGS: Record<S2TargetPortal, PortalConfig> = {
  copasa: copasaConfig,
  cemig: cemigConfig,
  fundep: PORTAL_CONFIGS.fundep,
  funarbe: PORTAL_CONFIGS.funarbe,
  comprasmg: PORTAL_CONFIGS.comprasmg,
  fiemg: fiemgConfig,
};

const mutablePortalConfigs = PORTAL_CONFIGS as unknown as Record<string, PortalConfig>;
Object.assign(mutablePortalConfigs, S2_PORTAL_CONFIGS);

// Mantém o código legado disponível no histórico do repositório, porém o
// registro carregado em runtime fica deliberadamente restrito aos seis portais.
for (const portal of Object.keys(mutablePortalConfigs)) {
  if (!(S2_TARGET_PORTALS as readonly string[]).includes(portal)) {
    delete mutablePortalConfigs[portal];
  }
}

export { S2_TARGET_PORTALS };
export type { S2TargetPortal };
