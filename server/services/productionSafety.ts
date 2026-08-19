export function isProduction(): boolean { return process.env.NODE_ENV === "production"; }
export function automaticEmailReportsEnabled(): boolean { return false; }
export function automaticProposalSendEnabled(): boolean { return process.env.QUOTATION_AUTO_SEND_ENABLED === "true"; }
