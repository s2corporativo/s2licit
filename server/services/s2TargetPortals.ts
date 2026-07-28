export const S2_TARGET_PORTALS = [
  "copasa",
  "cemig",
  "fundep",
  "funarbe",
  "comprasmg",
  "fiemg",
] as const;

export type S2TargetPortal = (typeof S2_TARGET_PORTALS)[number];

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
