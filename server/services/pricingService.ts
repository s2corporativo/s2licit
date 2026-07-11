import { TRPCError } from "@trpc/server";

/**
 * Configuração de precificação para um fornecedor
 */
export interface PricingConfiguration {
  supplierId: number;
  region: string; // "Nacional", "SP", "RJ", etc.
  
  // Impostos (em percentual)
  icmsPercentage: number; // ICMS %
  ipPercentage: number; // IP %
  pisPercentage: number; // PIS %
  cofinsPercentage: number; // COFINS %
  
  // Fretes
  freightType: "fixed" | "percentage"; // Tipo de frete
  freightValue: number; // Valor fixo ou percentual
  
  // Margem de lucro
  marginPercentage: number; // Margem de lucro %
  
  // Limites
  minPrice?: number; // Preço mínimo
  maxPrice?: number; // Preço máximo
  roundingMethod: "round" | "ceil" | "floor"; // Arredondamento
}

/**
 * Resultado do cálculo de preço
 */
export interface PricingCalculation {
  basePriceBeforeTax: number;
  icmsAmount: number;
  ipAmount: number;
  pisAmount: number;
  cofinsAmount: number;
  totalTaxAmount: number;
  freightAmount: number;
  priceBeforeMargin: number;
  marginAmount: number;
  finalPrice: number;
  breakdown: {
    basePrice: number;
    taxes: number;
    freight: number;
    margin: number;
    final: number;
  };
}

export class PricingService {
  /**
   * Calcula o preço final com impostos, fretes e margem
   */
  static calculatePrice(
    basePrice: number,
    config: PricingConfiguration
  ): PricingCalculation {
    if (basePrice <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Preço base deve ser maior que zero",
      });
    }

    // 1. Calcular impostos
    const icmsAmount = (basePrice * config.icmsPercentage) / 100;
    const ipAmount = (basePrice * config.ipPercentage) / 100;
    const pisAmount = (basePrice * config.pisPercentage) / 100;
    const cofinsAmount = (basePrice * config.cofinsPercentage) / 100;
    const totalTaxAmount = icmsAmount + ipAmount + pisAmount + cofinsAmount;

    // 2. Calcular frete
    let freightAmount = 0;
    if (config.freightType === "fixed") {
      freightAmount = config.freightValue;
    } else if (config.freightType === "percentage") {
      freightAmount = (basePrice * config.freightValue) / 100;
    }

    // 3. Preço antes da margem (custo total = produto + impostos + frete)
    const priceBeforeMargin = basePrice + totalTaxAmount + freightAmount;

    // 4. Calcular margem REAL sobre o preço de venda
    // FÓRMULA CORRETA: finalPrice = custo / (1 - margem%)
    // Diferença do mark-up (errado): custo * (1 + margem%) → resulta em margem MENOR que o configurado
    // Exemplo com 30%: custo=100 → markup daria 130 (margem real 23,1%), margem correta daria 142,86 (margem real 30%)
    if (config.marginPercentage >= 100) {
      throw new Error("Margem não pode ser 100% ou superior");
    }
    let finalPrice = priceBeforeMargin / (1 - config.marginPercentage / 100);
    const marginAmount = finalPrice - priceBeforeMargin;

    // 6. Aplicar limites
    if (config.minPrice && finalPrice < config.minPrice) {
      finalPrice = config.minPrice;
    }
    if (config.maxPrice && finalPrice > config.maxPrice) {
      finalPrice = config.maxPrice;
    }

    // 7. Arredondar
    finalPrice = this.roundPrice(finalPrice, config.roundingMethod);

    return {
      basePriceBeforeTax: basePrice,
      icmsAmount: this.roundPrice(icmsAmount, "round"),
      ipAmount: this.roundPrice(ipAmount, "round"),
      pisAmount: this.roundPrice(pisAmount, "round"),
      cofinsAmount: this.roundPrice(cofinsAmount, "round"),
      totalTaxAmount: this.roundPrice(totalTaxAmount, "round"),
      freightAmount: this.roundPrice(freightAmount, "round"),
      priceBeforeMargin: this.roundPrice(priceBeforeMargin, "round"),
      marginAmount: this.roundPrice(marginAmount, "round"),
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
   * Calcula preços em lote para múltiplos produtos
   */
  static calculateBatchPrices(
    products: Array<{ id: number; basePrice: number }>,
    config: PricingConfiguration
  ): Array<{ id: number; calculation: PricingCalculation }> {
    return products.map((product) => ({
      id: product.id,
      calculation: this.calculatePrice(product.basePrice, config),
    }));
  }

  /**
   * Arredonda o preço conforme o método especificado
   */
  private static roundPrice(
    price: number,
    method: "round" | "ceil" | "floor"
  ): number {
    // Arredondar para 2 casas decimais
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
   * Valida configuração de precificação
   */
  static validateConfig(config: Partial<PricingConfiguration>): string[] {
    const errors: string[] = [];

    if (!config.supplierId) errors.push("supplierId é obrigatório");
    if (config.marginPercentage === undefined || config.marginPercentage < 0 || config.marginPercentage >= 100)
      errors.push("marginPercentage deve ser >= 0");
    if (config.icmsPercentage === undefined || config.icmsPercentage < 0)
      errors.push("icmsPercentage deve ser >= 0");
    if (config.ipPercentage === undefined || config.ipPercentage < 0)
      errors.push("ipPercentage deve ser >= 0");
    if (config.pisPercentage === undefined || config.pisPercentage < 0)
      errors.push("pisPercentage deve ser >= 0");
    if (config.cofinsPercentage === undefined || config.cofinsPercentage < 0)
      errors.push("cofinsPercentage deve ser >= 0");
    if (config.freightValue === undefined || config.freightValue < 0)
      errors.push("freightValue deve ser >= 0");
    if (config.minPrice && config.maxPrice && config.minPrice > config.maxPrice)
      errors.push("minPrice não pode ser maior que maxPrice");

    return errors;
  }

  /**
   * Gera configuração padrão
   */
  static getDefaultConfig(supplierId: number): PricingConfiguration {
    return {
      supplierId,
      region: "Nacional",
      icmsPercentage: 0,
      ipPercentage: 0,
      pisPercentage: 0,
      cofinsPercentage: 0,
      freightType: "fixed",
      freightValue: 0,
      marginPercentage: 30, // 30% de margem padrão
      roundingMethod: "round",
    };
  }

  /**
   * Calcula economia/diferença entre dois preços
   */
  static calculateSavings(
    originalPrice: number,
    newPrice: number
  ): {
    savingsAmount: number;
    savingsPercentage: number;
    isIncrease: boolean;
  } {
    const savingsAmount = originalPrice - newPrice;
    const savingsPercentage = (savingsAmount / originalPrice) * 100;

    return {
      savingsAmount: Math.round(savingsAmount * 100) / 100,
      savingsPercentage: Math.round(savingsPercentage * 100) / 100,
      isIncrease: savingsAmount < 0,
    };
  }
}
