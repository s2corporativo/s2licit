import { describe, expect, it } from "vitest";
import { editalProposalDedupeKey } from "./editalProposalService";

describe("edital proposal idempotency key", () => {
  it("normalizes case and surrounding whitespace", () => {
    const first = editalProposalDedupeKey("  PE 001/2026 ", "Prefeitura de Betim");
    const second = editalProposalDedupeKey("pe 001/2026", "  PREFEITURA DE BETIM  ");
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps different process or organization identities distinct", () => {
    expect(editalProposalDedupeKey("001/2026", "Órgão A"))
      .not.toBe(editalProposalDedupeKey("002/2026", "Órgão A"));
    expect(editalProposalDedupeKey("001/2026", "Órgão A"))
      .not.toBe(editalProposalDedupeKey("001/2026", "Órgão B"));
  });
});
