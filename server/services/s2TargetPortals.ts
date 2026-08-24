export const S2_TARGET_PORTALS = [
  "copasa",
  "cemig",
  "fundep",
  "funarbe",
  "comprasmg",
  "fiemg",
] as const;

export type S2TargetPortal = (typeof S2_TARGET_PORTALS)[number];

export const FUNARBE_PROVIDER_BASE_URL = "https://fornecedor.funarbe.org.br";
/**
 * Rotas de descoberta de novas cotações na área autenticada da Funarbe.
 * A tela de "aguardando confirmação" não entra aqui porque representa
 * cotações já respondidas/pós-venda e não deve voltar para a fila comercial.
 */
export const FUNARBE_PROVIDER_LIST_URLS = [
  `${FUNARBE_PROVIDER_BASE_URL}/compra-produtos-diversos`,
  `${FUNARBE_PROVIDER_BASE_URL}/pedidos-compra`,
] as const;

export interface S2TargetPortalDefinition {
  portal: S2TargetPortal;
  label: string;
  orgao: string;
  publicUrl: string;
  environmentUrl?: string;
  discovery: "public" | "public_rendered" | "authenticated_assisted";
}

export const S2_TARGET_PORTAL_DEFINITIONS: Record<S2TargetPortal, S2TargetPortalDefinition> = {
  copasa: {
    portal: "copasa",
    label: "COPASA",
    orgao: "COPASA MG",
    publicUrl: "https://wwwapp.copasa.com.br/servicos/RDC/Rdc/",
    environmentUrl: "COPASA_OPPORTUNITIES_URL",
    discovery: "authenticated_assisted",
  },
  cemig: {
    portal: "cemig",
    label: "CEMIG",
    orgao: "CEMIG",
    publicUrl: "https://app2-compras.cemig.com.br/pesquisa",
    environmentUrl: "CEMIG_OPPORTUNITIES_URL",
    discovery: "public_rendered",
  },
  fundep: {
    portal: "fundep",
    label: "Fundep",
    orgao: "FUNDEP",
    publicUrl: "https://portaldecompras.fundep.ufmg.br/Publico/ConsultarGruposAtivos.aspx",
    discovery: "public",
  },
  funarbe: {
    portal: "funarbe",
    label: "Funarbe",
    orgao: "FUNARBE",
    publicUrl: "https://compras.funarbe.org.br/",
    discovery: "public_rendered",
  },
  comprasmg: {
    portal: "comprasmg",
    label: "Compras MG",
    orgao: "Estado de Minas Gerais",
    publicUrl: "https://www1.compras.mg.gov.br/",
    environmentUrl: "COMPRASMG_OPPORTUNITIES_URL",
    discovery: "public_rendered",
  },
  fiemg: {
    portal: "fiemg",
    label: "FIEMG / SESI / SENAI",
    orgao: "Sistema FIEMG",
    publicUrl: "https://compras.fiemg.com.br/portal/Mural.aspx?nNmTela=E",
    environmentUrl: "FIEMG_OPPORTUNITIES_URL",
    discovery: "public_rendered",
  },
};

/**
 * Portal do FORNECEDOR da Funarbe (plataforma Agrega/Yii2): só expõe as
 * cotações ao fornecedor logado. O mural público continua em publicUrl;
 * estas rotas são usadas apenas pela descoberta autenticada, depois do login.
 */
export const FUNARBE_PROVIDER_BASE_URL = "https://fornecedor.funarbe.org.br";

export const FUNARBE_PROVIDER_LIST_URLS: string[] = [
  `${FUNARBE_PROVIDER_BASE_URL}/compra-produtos-diversos`,
  `${FUNARBE_PROVIDER_BASE_URL}/pedidos-compra`,
  `${FUNARBE_PROVIDER_BASE_URL}/cotacao-aguardando-confirmacao`,
];

export function isS2TargetPortal(value: string): value is S2TargetPortal {
  return (S2_TARGET_PORTALS as readonly string[]).includes(value);
}

export function getS2PortalUrl(portal: S2TargetPortal): string {
  const definition = S2_TARGET_PORTAL_DEFINITIONS[portal];
  const configured = definition.environmentUrl
    ? process.env[definition.environmentUrl]?.trim()
    : undefined;
  return configured || definition.publicUrl;
}
