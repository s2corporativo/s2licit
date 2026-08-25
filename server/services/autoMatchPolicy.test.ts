import { describe, expect, it } from "vitest";
import { mayAutoConfirmWithoutTechnicalGuard, methodIsDeterministic } from "./matchingDecisionPolicy";
import { validateTechnicalMatch } from "./technicalMatchGuard";

 describe("matchingDecisionPolicy", () => {
  it("aceita apenas identificadores determinísticos sem guarda técnica", () => {
    expect(methodIsDeterministic("catmat")).toBe(true);
    expect(methodIsDeterministic("catmas")).toBe(true);
    expect(methodIsDeterministic("nome")).toBe(false);
    expect(methodIsDeterministic("rag")).toBe(false);
    expect(mayAutoConfirmWithoutTechnicalGuard("nome")).toBe(false);
  });

  it("bloqueia medicamento com concentração divergente", () => {
    const result = validateTechnicalMatch(
      { tipoCatalogo: "medicamento_veterinario", activeIngredient: "enrofloxacino", concentration: "10%" },
      { activeIngredient: "enrofloxacino", concentration: "2,5%" },
    );
    expect(result.safe).toBe(false);
    expect(result.reasons.join(" ")).toContain("Concentração divergente");
  });
});
