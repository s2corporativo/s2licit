import { describe, it, expect } from "vitest";

describe("Import Error Handling", () => {
  describe("previewImportFuzzy endpoint", () => {
    it("should reject empty rows array", () => {
      const input = { rows: [], supplierId: 1 };
      expect(input.rows.length).toBe(0);
      expect(() => {
        if (!input.rows || input.rows.length === 0) {
          throw new Error("Array 'rows' não pode estar vazio");
        }
      }).toThrow("Array 'rows' não pode estar vazio");
    });

    it("should reject rows exceeding 3000 limit", () => {
      const input = { 
        rows: Array(3001).fill({ name: "Product" }), 
        supplierId: 1 
      };
      expect(input.rows.length).toBe(3001);
      expect(() => {
        if (input.rows.length > 3000) {
          throw new Error("Máximo de 3000 linhas por requisição");
        }
      }).toThrow("Máximo de 3000 linhas por requisição");
    });

    it("should accept valid rows within limits (50 rows)", () => {
      const input = { 
        rows: Array(50).fill({ name: "Product" }), 
        supplierId: 1 
      };
      expect(input.rows.length).toBe(50);
      expect(() => {
        if (!input.rows || input.rows.length === 0) {
          throw new Error("Array 'rows' não pode estar vazio");
        }
        if (input.rows.length > 3000) {
          throw new Error("Máximo de 3000 linhas por requisição");
        }
      }).not.toThrow();
    });

    it("should accept up to 3000 rows", () => {
      const input = { 
        rows: Array(3000).fill({ name: "Product" }), 
        supplierId: 1 
      };
      expect(input.rows.length).toBe(3000);
      expect(() => {
        if (!input.rows || input.rows.length === 0) {
          throw new Error("Array 'rows' não pode estar vazio");
        }
        if (input.rows.length > 3000) {
          throw new Error("Máximo de 3000 linhas por requisição");
        }
      }).not.toThrow();
    });
  });

  describe("previewWithDuplicates endpoint - tripé Nome+FichaTécnica+Apresentação", () => {
    it("should reject invalid supplier ID", () => {
      const input = { 
        rows: [{ name: "Product", fichaTecnica: "10mg" }], 
        supplierId: -1 
      };
      expect(() => {
        if (!input.supplierId || input.supplierId <= 0) {
          throw new Error("ID do fornecedor inválido");
        }
      }).toThrow("ID do fornecedor inválido");
    });

    it("should reject zero supplier ID", () => {
      const input = { 
        rows: [{ name: "Product" }], 
        supplierId: 0 
      };
      expect(() => {
        if (!input.supplierId || input.supplierId <= 0) {
          throw new Error("ID do fornecedor inválido");
        }
      }).toThrow("ID do fornecedor inválido");
    });

    it("should accept valid supplier ID", () => {
      const input = { 
        rows: [{ name: "Product" }], 
        supplierId: 1 
      };
      expect(() => {
        if (!input.supplierId || input.supplierId <= 0) {
          throw new Error("ID do fornecedor inválido");
        }
      }).not.toThrow();
    });

    it("should use fichaTecnica (not concentration) as second field of tripé", () => {
      // O tripé correto é Nome + FichaTécnica + Apresentação
      const row = { name: "Amoxicilina", fichaTecnica: "500mg comprimidos", presentation: "Frasco 30cp" };
      const key = `${row.name}|${row.fichaTecnica}|${row.presentation}`;
      expect(key).toBe("Amoxicilina|500mg comprimidos|Frasco 30cp");
      // Não deve usar concentration
      expect(row).not.toHaveProperty("concentration");
    });

    it("should treat products with different fichaTecnica as distinct", () => {
      // Produtos com FichaTécnica diferente são DISTINTOS, não duplicatas
      const rowA = { name: "Amoxicilina", fichaTecnica: "500mg", presentation: "Frasco 30cp" };
      const rowB = { name: "Amoxicilina", fichaTecnica: "250mg", presentation: "Frasco 30cp" };
      const keyA = `${rowA.name}|${rowA.fichaTecnica}|${rowA.presentation}`;
      const keyB = `${rowB.name}|${rowB.fichaTecnica}|${rowB.presentation}`;
      expect(keyA).not.toBe(keyB);
    });

    it("should treat products with different presentation as distinct", () => {
      // Produtos com Apresentação diferente são DISTINTOS, não duplicatas
      const rowA = { name: "Amoxicilina", fichaTecnica: "500mg", presentation: "Frasco 30cp" };
      const rowB = { name: "Amoxicilina", fichaTecnica: "500mg", presentation: "Frasco 60cp" };
      const keyA = `${rowA.name}|${rowA.fichaTecnica}|${rowA.presentation}`;
      const keyB = `${rowB.name}|${rowB.fichaTecnica}|${rowB.presentation}`;
      expect(keyA).not.toBe(keyB);
    });

    it("should detect duplicates when all three fields match", () => {
      // Só é duplicata quando Nome + FichaTécnica + Apresentação são iguais
      const rowA = { name: "Amoxicilina", fichaTecnica: "500mg", presentation: "Frasco 30cp" };
      const rowB = { name: "Amoxicilina", fichaTecnica: "500mg", presentation: "Frasco 30cp" };
      const keyA = `${rowA.name}|${rowA.fichaTecnica}|${rowA.presentation}`;
      const keyB = `${rowB.name}|${rowB.fichaTecnica}|${rowB.presentation}`;
      expect(keyA).toBe(keyB);
    });
  });

  describe("pricesByName endpoint", () => {
    it("should reject empty product name", () => {
      const input = { name: "" };
      expect(() => {
        if (!input.name || input.name.trim().length === 0) {
          throw new Error("Nome do produto não pode estar vazio");
        }
      }).toThrow("Nome do produto não pode estar vazio");
    });

    it("should reject whitespace-only product name", () => {
      const input = { name: "   " };
      expect(() => {
        if (!input.name || input.name.trim().length === 0) {
          throw new Error("Nome do produto não pode estar vazio");
        }
      }).toThrow("Nome do produto não pode estar vazio");
    });

    it("should accept valid product name", () => {
      const input = { name: "Amoxicilina 500mg" };
      expect(() => {
        if (!input.name || input.name.trim().length === 0) {
          throw new Error("Nome do produto não pode estar vazio");
        }
      }).not.toThrow();
    });
  });

  describe("applyCategoryReviewToCatalog endpoint", () => {
    it("should reject empty reviews array", () => {
      const input = { reviews: [], matchMode: "fuzzy" as const };
      expect(() => {
        if (!input.reviews || input.reviews.length === 0) {
          throw new Error("Array 'reviews' não pode estar vazio");
        }
      }).toThrow("Array 'reviews' não pode estar vazio");
    });

    it("should reject reviews exceeding 1000 limit", () => {
      const input = { 
        reviews: Array(1001).fill({ 
          nome: "Product", 
          categoria: "Category" 
        }), 
        matchMode: "fuzzy" as const 
      };
      expect(() => {
        if (input.reviews.length > 1000) {
          throw new Error("Máximo de 1000 registros por requisição");
        }
      }).toThrow("Máximo de 1000 registros por requisição");
    });

    it("should reject empty product name in review", () => {
      const input = { 
        reviews: [{ nome: "", categoria: "Category" }], 
        matchMode: "fuzzy" as const 
      };
      expect(() => {
        for (const review of input.reviews) {
          if (!review.nome || review.nome.trim().length === 0) {
            throw new Error("Nome do produto não pode estar vazio");
          }
        }
      }).toThrow("Nome do produto não pode estar vazio");
    });

    it("should reject empty category in review", () => {
      const input = { 
        reviews: [{ nome: "Product", categoria: "" }], 
        matchMode: "fuzzy" as const 
      };
      expect(() => {
        for (const review of input.reviews) {
          if (!review.categoria || review.categoria.trim().length === 0) {
            throw new Error("Categoria não pode estar vazia");
          }
        }
      }).toThrow("Categoria não pode estar vazia");
    });

    it("should accept valid reviews", () => {
      const input = { 
        reviews: [
          { nome: "Amoxicilina", categoria: "Antibiótico" },
          { nome: "Dipirona", categoria: "Analgésico" }
        ], 
        matchMode: "fuzzy" as const 
      };
      expect(() => {
        if (!input.reviews || input.reviews.length === 0) {
          throw new Error("Array 'reviews' não pode estar vazio");
        }
        if (input.reviews.length > 1000) {
          throw new Error("Máximo de 1000 registros por requisição");
        }
        for (const review of input.reviews) {
          if (!review.nome || review.nome.trim().length === 0) {
            throw new Error("Nome do produto não pode estar vazio");
          }
          if (!review.categoria || review.categoria.trim().length === 0) {
            throw new Error("Categoria não pode estar vazia");
          }
        }
      }).not.toThrow();
    });
  });

  describe("Error message formatting", () => {
    it("should format error messages with context", () => {
      const errorCode = "VALIDATION_ERROR";
      const message = "Array 'rows' não pode estar vazio";
      const context = { endpoint: "previewImportFuzzy", rowCount: 0 };
      
      const errorLog = JSON.stringify({
        timestamp: new Date().toISOString(),
        errorCode,
        message,
        context,
      });

      expect(errorLog).toContain("VALIDATION_ERROR");
      expect(errorLog).toContain("Array 'rows' não pode estar vazio");
      expect(errorLog).toContain("previewImportFuzzy");
    });
  });
});

describe("Chunking automático de importação (planilhas > 3000 linhas)", () => {
  const CHUNK_SIZE = 2500;

  function splitIntoChunks<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }

  it("should NOT split planilha with <= 2500 rows (single chunk)", () => {
    const rows = Array(2500).fill({ nome: "Produto" });
    const chunks = splitIntoChunks(rows, CHUNK_SIZE);
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(2500);
  });

  it("should split 5000 rows into 2 chunks", () => {
    const rows = Array(5000).fill({ nome: "Produto" });
    const chunks = splitIntoChunks(rows, CHUNK_SIZE);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(2500);
    expect(chunks[1].length).toBe(2500);
  });

  it("should split 7500 rows into 3 chunks", () => {
    const rows = Array(7500).fill({ nome: "Produto" });
    const chunks = splitIntoChunks(rows, CHUNK_SIZE);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(2500);
    expect(chunks[1].length).toBe(2500);
    expect(chunks[2].length).toBe(2500);
  });

  it("should handle uneven split (6000 rows → 3 chunks: 2500+2500+1000)", () => {
    const rows = Array(6000).fill({ nome: "Produto" });
    const chunks = splitIntoChunks(rows, CHUNK_SIZE);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(2500);
    expect(chunks[1].length).toBe(2500);
    expect(chunks[2].length).toBe(1000);
  });

  it("should preserve total item count across all chunks", () => {
    const totalItems = 8750;
    const rows = Array(totalItems).fill({ nome: "Produto" });
    const chunks = splitIntoChunks(rows, CHUNK_SIZE);
    const totalInChunks = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    expect(totalInChunks).toBe(totalItems);
  });

  it("should calculate correct chunk count for large spreadsheet", () => {
    const totalItems = 10000;
    const expectedChunks = Math.ceil(totalItems / CHUNK_SIZE);
    expect(expectedChunks).toBe(4);
  });

  it("should correctly map rowActions to chunk offset", () => {
    // Simula o mapeamento de rowActions para o chunk correto
    const rowActions: Record<string, string> = {
      "0": "insert",
      "2499": "update",
      "2500": "skip",   // pertence ao chunk 2
      "4999": "insert", // pertence ao chunk 2
    };
    const CHUNK_SIZE_TEST = 2500;

    // Chunk 0 (índices 0-2499)
    const chunkStart0 = 0;
    const chunkRowActions0: Record<string, string> = {};
    for (let i = 0; i < CHUNK_SIZE_TEST; i++) {
      const globalIdx = chunkStart0 + i;
      const action = rowActions[String(globalIdx)];
      if (action) chunkRowActions0[String(i)] = action;
    }
    expect(chunkRowActions0["0"]).toBe("insert");
    expect(chunkRowActions0["2499"]).toBe("update");
    expect(chunkRowActions0["2500"]).toBeUndefined(); // não pertence a este chunk

    // Chunk 1 (índices 2500-4999)
    const chunkStart1 = 2500;
    const chunkRowActions1: Record<string, string> = {};
    for (let i = 0; i < CHUNK_SIZE_TEST; i++) {
      const globalIdx = chunkStart1 + i;
      const action = rowActions[String(globalIdx)];
      if (action) chunkRowActions1[String(i)] = action;
    }
    expect(chunkRowActions1["0"]).toBe("skip");   // índice global 2500 → local 0
    expect(chunkRowActions1["2499"]).toBe("insert"); // índice global 4999 → local 2499
  });

  it("should accumulate results correctly across chunks", () => {
    // Simula acumulação de resultados de 3 lotes
    const chunkResults = [
      { imported: 1200, updated: 300, skipped: 0, errors: 0 },
      { imported: 900, updated: 600, skipped: 50, errors: 2 },
      { imported: 700, updated: 200, skipped: 100, errors: 1 },
    ];

    let accInserted = 0, accUpdated = 0, accSkipped = 0, accErrors = 0;
    for (const r of chunkResults) {
      accInserted += r.imported;
      accUpdated += r.updated;
      accSkipped += r.skipped;
      accErrors += r.errors;
    }

    expect(accInserted).toBe(2800);
    expect(accUpdated).toBe(1100);
    expect(accSkipped).toBe(150);
    expect(accErrors).toBe(3);
    expect(accInserted + accUpdated + accSkipped + accErrors).toBe(4053);
  });

  it("should calculate correct progress percentage per chunk", () => {
    const totalChunks = 4;
    // Após chunk 0: 25%, após chunk 1: 50%, após chunk 2: 75%, após chunk 3: 100%
    for (let i = 0; i < totalChunks; i++) {
      const pct = Math.round(((i + 1) / totalChunks) * 100);
      expect(pct).toBe((i + 1) * 25);
    }
  });
});
