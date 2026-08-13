import { describe, expect, it } from "vitest";
import {
  editalExtractionSystemPrompt,
  editalExtractionUserPrompt,
  TIPOS_MARCA,
} from "./index";

describe("prompts de extração de edital", () => {
  it("primeiro chunk não menciona trecho intermediário", () => {
    const prompt = editalExtractionSystemPrompt({ isFirstChunk: true });
    expect(prompt).not.toContain("trecho intermediário");
    expect(prompt).toContain("CATMAT/CATSER");
    expect(prompt).toContain("tipoMarca");
    expect(prompt).toContain("referenciaBrand");
    expect(prompt).toContain("descricaoOriginal");
    expect(prompt).toContain("lote");
    expect(prompt).toContain("APENAS com JSON válido");
  });

  it("chunks intermediários instruem a não repetir itens", () => {
    const prompt = editalExtractionSystemPrompt({ isFirstChunk: false });
    expect(prompt).toContain("trecho intermediário/final de um edital maior");
    expect(prompt).toContain("sem inventar nem repetir itens");
  });

  it("prompt de usuário embute o texto do trecho", () => {
    const user = editalExtractionUserPrompt("TRECHO-TESTE-XYZ");
    expect(user).toContain("TRECHO-TESTE-XYZ");
    expect(user.startsWith("Analise")).toBe(true);
  });

  it("TIPOS_MARCA cobre o universo da TipoMarca", () => {
    expect(TIPOS_MARCA).toEqual(["livre", "referencia", "restrita", "naoSei"]);
  });
});
