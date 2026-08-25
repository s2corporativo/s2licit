import { describe, expect, it } from "vitest";
import { validateTechnicalMatch } from "./technicalMatchGuard";

describe("technicalMatchGuard", () => {
  it("aceita candidato tecnicamente idêntico", () => {
    const r = validateTechnicalMatch(
      { tipoCatalogo: "medicamento_veterinario", activeIngredient: "amoxicilina", concentration: "50 mg", administrationRoute: "oral" },
      { activeIngredient: "amoxicilina", concentration: "50 mg", administrationRoute: "oral" },
    );
    expect(r.safe).toBe(true);
  });
});
