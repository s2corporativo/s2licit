import { TRPCError } from "@trpc/server";

/**
 * Regra de precificação por categoria
 */
export interface CategoryPricingRule {
  categoryId: number;
  categoryName: string;
  supplierId: number;
  
  // Impostos (em percentual)
  icmsPercentage: number;
  ipPercentage: number;
  pisPercentage: number;
  cofinsPercentage: number;
  
  // Fretes
  freightType: "fixed" | "percentage";
  freightValue: number;
  
  // Margem de lucro
  marginPercentage: number;
  
  // Limites
  minPrice?: number;
  maxPrice?: number;
  roundingMethod: "round" | "ceil" | "floor";
  
  // Status
  isActive: boolean;
}

/**
 * Resultado da aplicação de precificação em massa
 */
export interface BulkPricingResult {
  success: boolean;
  totalProducts: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{ productId: number; error: string }>;
  message: string;
  details?: {
    averagePriceIncrease: number;
    minNewPrice: number;
    maxNewPrice: number;
  };
}

/**
 * Serviço de gerenciamento de regras de precificação por categoria
 */
export class CategoryPricingService {
  /**
   * Validar regra de precificação
   */
  static validateRule(rule: Partial<CategoryPricingRule>): string[] {
    const errors: string[] = [];

    if (!rule.categoryId) errors.push("categoryId é obrigatório");
    if (!rule.supplierId) errors.push("supplierId é obrigatório");
    if (rule.marginPercentage === undefined || rule.marginPercentage < 0)
      errors.push("marginPercentage deve ser >= 0");
    if (rule.icmsPercentage === undefined || rule.icmsPercentage < 0)
      errors.push("icmsPercentage deve ser >= 0");
    if (rule.ipPercentage === undefined || rule.ipPercentage < 0)
      errors.push("ipPercentage deve ser >= 0");
    if (rule.pisPercentage === undefined || rule.pisPercentage < 0)
      errors.push("pisPercentage deve ser >= 0");
    if (rule.cofinsPercentage === undefined || rule.cofinsPercentage < 0)
      errors.push("cofinsPercentage deve ser >= 0");
    if (rule.freightValue === undefined || rule.freightValue < 0)
      errors.push("freightValue deve ser >= 0");
    if (rule.minPrice && rule.maxPrice && rule.minPrice > rule.maxPrice)
      errors.push("minPrice não pode ser maior que maxPrice");

    return errors;
  }

  /**
   * Obter regra padrão para uma categoria
   */
  static getDefaultRule(categoryId: number, supplierId: number): CategoryPricingRule {
    return {
      categoryId,
      categoryName: "",
      supplierId,
      icmsPercentage: 0,
      ipPercentage: 0,
      pisPercentage: 0,
      cofinsPercentage: 0,
      freightType: "fixed",
      freightValue: 0,
      marginPercentage: 30, // 30% de margem padrão
      roundingMethod: "round",
      isActive: true,
    };
  }

  /**
   * Calcular preço usando regra de categoria
   */
  static calculatePriceWithRule(
    basePrice: number,
    rule: CategoryPricingRule
  ): {
    finalPrice: number;
    breakdown: {
      basePrice: number;
      taxes: number;
      freight: number;
      margin: number;
      final: number;
    };
  } {
    if (basePrice <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Preço base deve ser maior que zero",
      });
    }

    // 1. Calcular impostos
    const icmsAmount = (basePrice * rule.icmsPercentage) / 100;
    const ipAmount = (basePrice * rule.ipPercentage) / 100;
    const pisAmount = (basePrice * rule.pisPercentage) / 100;
    const cofinsAmount = (basePrice * rule.cofinsPercentage) / 100;
    const totalTaxAmount = icmsAmount + ipAmount + pisAmount + cofinsAmount;

    // 2. Calcular frete
    let freightAmount = 0;
    if (rule.freightType === "fixed") {
      freightAmount = rule.freightValue;
    } else if (rule.freightType === "percentage") {
      freightAmount = (basePrice * rule.freightValue) / 100;
    }

    // 3. Preço antes da margem
    const priceBeforeMargin = basePrice + totalTaxAmount + freightAmount;

    // 4. Calcular margem REAL sobre o preço de venda (mesmo padrão do pricingService)
    // FÓRMULA CORRETA: finalPrice = custo / (1 - margem%)
    if (rule.marginPercentage >= 100) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Margem não pode ser 100% ou superior",
      });
    }

    // 5. Preço final
    let finalPrice = priceBeforeMargin / (1 - rule.marginPercentage / 100);
    const marginAmount = finalPrice - priceBeforeMargin;

    // 6. Aplicar limites
    if (rule.minPrice && finalPrice < rule.minPrice) {
      finalPrice = rule.minPrice;
    }
    if (rule.maxPrice && finalPrice > rule.maxPrice) {
      finalPrice = rule.maxPrice;
    }

    // 7. Arredondar
    finalPrice = this.roundPrice(finalPrice, rule.roundingMethod);

    return {
      finalPrice,
      breakdown: {
        basePrice: this.roundPrice(basePrice, "round"),
        taxes: this.roundPrice(totalTaxAmount, "round"),
        freight: this.roundPrice(freightAmount, "round"),
        margin: this.roundPrice(marginAmount, "round"),
        final: finalPrice,
      },
    };
  }

  /**
   * Arredonda o preço conforme o método especificado
   */
  private static roundPrice(
    price: number,
    method: "round" | "ceil" | "floor"
  ): number {
    const factor = 100;
    const value = price * factor;

    let rounded: number;
    switch (method) {
      case "ceil":
        rounded = Math.ceil(value);
        break;
      case "floor":
        rounded = Math.floor(value);
        break;
      case "round":
      default:
        rounded = Math.round(value);
        break;
    }

    return rounded / factor;
  }

  /**
   * Gerar categorias padrão
   */
  static getDefaultCategories(): Array<{ id: number; name: string }> {
    return [
      { id: 1, name: "Medicamentos Veterinários" },
      { id: 2, name: "Medicamentos Humanos" },
      { id: 3, name: "Produtos Agro" },
      { id: 4, name: "Insumos" },
      { id: 5, name: "Materiais Diversos" },
    ];
  }

  /**
   * Obter margens recomendadas por categoria
   */
  static getRecommendedMargins(): Record<string, number> {
    return {
      "Medicamentos Veterinários": 35,
      "Medicamentos Humanos": 30,
      "Produtos Agro": 25,
      "Insumos": 20,
      "Materiais Diversos": 25,
    };
  }
}
