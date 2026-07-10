import { describe, it, expect } from "vitest";

// ─── Testes de Lógica de Precificação ─────────────────────────────────────
describe("Pricing Calculation Logic", () => {
  function calculateFinalPrice(
    basePrice: number,
    marginPct: number,
    icmsPct: number,
    ipPct: number,
    pisPct: number,
    cofinsPct: number,
    freightType: "fixed" | "percentage",
    freightValue: number
  ): number {
    const margin = marginPct / 100;
    const totalTax = (icmsPct + ipPct + pisPct + cofinsPct) / 100;
    const freightAmount =
      freightType === "percentage" ? basePrice * (freightValue / 100) : freightValue;
    const priceAfterTax = basePrice * (1 + totalTax);
    const priceAfterFreight = priceAfterTax + freightAmount;
    return Math.round(priceAfterFreight * (1 + margin) * 100) / 100;
  }

  it("deve calcular preço sem impostos e sem frete", () => {
    const result = calculateFinalPrice(100, 30, 0, 0, 0, 0, "fixed", 0);
    expect(result).toBe(130);
  });

  it("deve calcular preço com ICMS 12%", () => {
    const result = calculateFinalPrice(100, 30, 12, 0, 0, 0, "fixed", 0);
    // base 100 + 12% ICMS = 112, + 30% margem = 145.60
    expect(result).toBe(145.6);
  });

  it("deve calcular preço com frete fixo", () => {
    const result = calculateFinalPrice(100, 30, 0, 0, 0, 0, "fixed", 10);
    // base 100 + frete 10 = 110, + 30% margem = 143
    expect(result).toBe(143);
  });

  it("deve calcular preço com frete percentual", () => {
    const result = calculateFinalPrice(100, 30, 0, 0, 0, 0, "percentage", 5);
    // base 100 + 5% frete = 105, + 30% margem = 136.50
    expect(result).toBe(136.5);
  });

  it("deve calcular preço com todos os impostos", () => {
    const result = calculateFinalPrice(100, 30, 12, 1.5, 0.65, 3, "fixed", 0);
    // total tax = 17.15%, base 100 * 1.1715 = 117.15, + 30% = 152.30
    expect(result).toBeCloseTo(152.3, 1);
  });

  it("deve calcular preço com margem zero", () => {
    const result = calculateFinalPrice(100, 0, 0, 0, 0, 0, "fixed", 0);
    expect(result).toBe(100);
  });

  it("deve calcular preço com margem 100%", () => {
    const result = calculateFinalPrice(100, 100, 0, 0, 0, 0, "fixed", 0);
    expect(result).toBe(200);
  });
});

// ─── Testes de Validação de Regras ─────────────────────────────────────────
describe("Category Pricing Rule Validation", () => {
  function validateRule(rule: {
    categoryId: number;
    marginPercentage: number;
    icmsPercentage: number;
    ipPercentage: number;
    pisPercentage: number;
    cofinsPercentage: number;
    freightValue: number;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!rule.categoryId || rule.categoryId <= 0) {
      errors.push("ID de categoria inválido");
    }
    if (rule.marginPercentage < 0) {
      errors.push("Margem não pode ser negativa");
    }
    if (rule.marginPercentage > 1000) {
      errors.push("Margem muito alta (máximo 1000%)");
    }
    if (rule.icmsPercentage < 0 || rule.icmsPercentage > 100) {
      errors.push("ICMS deve estar entre 0% e 100%");
    }
    if (rule.ipPercentage < 0 || rule.ipPercentage > 100) {
      errors.push("IP deve estar entre 0% e 100%");
    }
    if (rule.pisPercentage < 0 || rule.pisPercentage > 100) {
      errors.push("PIS deve estar entre 0% e 100%");
    }
    if (rule.cofinsPercentage < 0 || rule.cofinsPercentage > 100) {
      errors.push("COFINS deve estar entre 0% e 100%");
    }
    if (rule.freightValue < 0) {
      errors.push("Frete não pode ser negativo");
    }

    return { valid: errors.length === 0, errors };
  }

  it("deve validar regra correta", () => {
    const result = validateRule({
      categoryId: 1,
      marginPercentage: 30,
      icmsPercentage: 12,
      ipPercentage: 1.5,
      pisPercentage: 0.65,
      cofinsPercentage: 3,
      freightValue: 10,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("deve rejeitar categoryId inválido", () => {
    const result = validateRule({
      categoryId: 0,
      marginPercentage: 30,
      icmsPercentage: 12,
      ipPercentage: 0,
      pisPercentage: 0,
      cofinsPercentage: 0,
      freightValue: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ID de categoria inválido");
  });

  it("deve rejeitar margem negativa", () => {
    const result = validateRule({
      categoryId: 1,
      marginPercentage: -5,
      icmsPercentage: 0,
      ipPercentage: 0,
      pisPercentage: 0,
      cofinsPercentage: 0,
      freightValue: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Margem não pode ser negativa");
  });

  it("deve rejeitar ICMS acima de 100%", () => {
    const result = validateRule({
      categoryId: 1,
      marginPercentage: 30,
      icmsPercentage: 150,
      ipPercentage: 0,
      pisPercentage: 0,
      cofinsPercentage: 0,
      freightValue: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ICMS deve estar entre 0% e 100%");
  });
});

// ─── Testes de Aplicação em Massa ──────────────────────────────────────────
describe("Bulk Pricing Application", () => {
  function simulateBulkApplication(
    products: Array<{ id: number; price: number }>,
    config: {
      marginPercentage: number;
      icmsPercentage: number;
      freightType: "fixed" | "percentage";
      freightValue: number;
    }
  ) {
    const margin = config.marginPercentage / 100;
    const icms = config.icmsPercentage / 100;
    const freightValue = config.freightValue;

    return products.map((p) => {
      const freightAmount =
        config.freightType === "percentage" ? p.price * (freightValue / 100) : freightValue;
      const priceAfterTax = p.price * (1 + icms);
      const priceAfterFreight = priceAfterTax + freightAmount;
      const newPrice = Math.round(priceAfterFreight * (1 + margin) * 100) / 100;
      return {
        productId: p.id,
        oldPrice: p.price,
        newPrice,
        increase: newPrice - p.price,
      };
    });
  }

  it("deve aplicar precificação em múltiplos produtos", () => {
    const products = [
      { id: 1, price: 100 },
      { id: 2, price: 200 },
      { id: 3, price: 50 },
    ];
    const results = simulateBulkApplication(products, {
      marginPercentage: 30,
      icmsPercentage: 0,
      freightType: "fixed",
      freightValue: 0,
    });
    expect(results).toHaveLength(3);
    expect(results[0].newPrice).toBe(130);
    expect(results[1].newPrice).toBe(260);
    expect(results[2].newPrice).toBe(65);
  });

  it("deve calcular aumento médio corretamente", () => {
    const products = [
      { id: 1, price: 100 },
      { id: 2, price: 200 },
    ];
    const results = simulateBulkApplication(products, {
      marginPercentage: 30,
      icmsPercentage: 0,
      freightType: "fixed",
      freightValue: 0,
    });
    const avgIncrease = results.reduce((sum, r) => sum + r.increase, 0) / results.length;
    expect(avgIncrease).toBe(45); // (30 + 60) / 2
  });

  it("deve lidar com lista vazia", () => {
    const results = simulateBulkApplication([], {
      marginPercentage: 30,
      icmsPercentage: 0,
      freightType: "fixed",
      freightValue: 0,
    });
    expect(results).toHaveLength(0);
  });
});
