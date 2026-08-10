import type { getCompanySettings, getProposalWithItems } from "../db";
import type { ProposalExcelInput } from "../proposalExcel";

export type ProposalWithItems = NonNullable<Awaited<ReturnType<typeof getProposalWithItems>>>;
export type CompanySettingsSnapshot = Awaited<ReturnType<typeof getCompanySettings>>;

/**
 * Snapshot comercial único para todos os documentos externos.
 *
 * Não transporta custo, margem ou dados internos desnecessários. PDF, XLSX e
 * envio SMTP recebem exatamente a mesma projeção de campos comerciais.
 */
export function proposalCommercialSnapshot(proposal: ProposalWithItems) {
  return {
    id: proposal.id,
    title: proposal.title,
    processNumber: proposal.processNumber,
    orgName: proposal.orgName,
    status: proposal.status,
    validityDays: proposal.validityDays,
    paymentTerms: proposal.paymentTerms,
    deliveryTerms: proposal.deliveryTerms,
    notes: proposal.notes,
    createdAt: proposal.createdAt,
    items: proposal.items.map((item) => ({
      id: item.id,
      sortOrder: item.sortOrder ?? item.itemNumber ?? 0,
      productName: item.productName,
      activeIngredient: item.activeIngredient,
      manufacturer: item.manufacturer,
      concentration: item.concentration,
      presentation: item.presentation,
      unit: item.unit,
      supplierName: item.supplierName,
      unitPrice: item.unitPrice,
      suggestedPrice: item.suggestedPrice,
      quantity: item.quantity,
      notes: item.notes,
      imageUrl: item.imageUrl,
      productUrl: item.productUrl,
      registroMapa: item.registroMapa,
    })),
  };
}

export function companyCommercialSnapshot(company: CompanySettingsSnapshot) {
  if (!company) return null;
  return {
    name: company.name,
    cnpj: company.cnpj,
    address: company.address,
    city: company.city,
    state: company.state,
    zipCode: company.zipCode,
    phone: company.phone,
    email: company.email,
    website: company.website,
    logoUrl: company.logoUrl,
    bankName: null,
    bankAgency: null,
    bankAccount: null,
    bankPixKey: null,
    defaultNotes: company.notes,
  };
}

export function proposalExcelSnapshot(
  proposal: ProposalWithItems,
  company: CompanySettingsSnapshot,
): ProposalExcelInput {
  const commercial = proposalCommercialSnapshot(proposal);
  const companySnapshot = companyCommercialSnapshot(company);
  return {
    proposal: {
      id: commercial.id,
      title: commercial.title,
      processNumber: commercial.processNumber,
      orgName: commercial.orgName,
      validityDays: commercial.validityDays,
      paymentTerms: commercial.paymentTerms,
      deliveryTerms: commercial.deliveryTerms,
      notes: commercial.notes,
      items: commercial.items,
    },
    company: companySnapshot
      ? {
          name: companySnapshot.name,
          cnpj: companySnapshot.cnpj,
          email: companySnapshot.email,
          phone: companySnapshot.phone,
          bankName: companySnapshot.bankName,
          bankAgency: companySnapshot.bankAgency,
          bankAccount: companySnapshot.bankAccount,
        }
      : null,
  };
}
