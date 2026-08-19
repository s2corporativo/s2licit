import { describe, expect, it } from "vitest";
import { isSensitiveAuditAction } from "./auditTrustPolicy";

describe("auditTrustPolicy", () => {
  it("classifica ações operacionais sensíveis", () => {
    expect(isSensitiveAuditAction("QUOTATION_SALE_PRICE_MANUAL")).toBe(true);
    expect(isSensitiveAuditAction("ui_open_modal")).toBe(false);
  });
});
