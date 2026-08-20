import { describe, expect, it } from "vitest";
import { duplicatesRouter } from "./routers/duplicates";

describe("duplicates router — merge canônico", () => {
  it("mantém as ações de decisão de duplicidade expostas no router", () => {
    const procedures = Object.keys(duplicatesRouter._def.procedures);
    expect(procedures).toContain("mergeDuplicates");
    expect(procedures).toContain("replaceProduct");
    expect(procedures).toContain("markAsNotDuplicate");
    expect(procedures).toContain("detectDuplicates");
  });
});
