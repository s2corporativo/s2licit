/**
 * Schema de domínio: Propostas, Itens, Status e Declarações.
 */
export {
  proposals,
  proposalItems,
  proposalStatusHistory,
  proposalDeclarations,
  declarationTemplates,
  quotations,
  quotationItems,
  requestingOrgs,
} from "../schema";

export type {
  Proposal,
  InsertProposal,
  ProposalItem,
  InsertProposalItem,
  ProposalStatusHistory,
  InsertProposalStatusHistory,
  ProposalDeclaration,
  InsertProposalDeclaration,
  DeclarationTemplate,
  InsertDeclarationTemplate,
  Quotation,
  InsertQuotation,
  QuotationItem,
  InsertQuotationItem,
  RequestingOrg,
  InsertRequestingOrg,
} from "../schema";
