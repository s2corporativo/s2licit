import { describe, expect, it } from "vitest";
import {
  EDITAL_CHUNK_OVERLAP,
  EDITAL_CHUNK_SIZE,
  EDITAL_MAX_CHUNKS,
  mergeEditalExtractions,
  splitEditalIntoChunks,
} from "./edital";

describe("splitEditalIntoChunks", () => {
  it("produz 1 único chunk e não marca truncamento para editais pequenos", () => {
    const text = "a".repeat(1000);
    const { chunks, truncated } = splitEditalIntoChunks(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
    expect(truncated).toBe(false);
  });

  it("cobre um edital de 300.000 chars com múltiplos chunks sem truncar (antes era cortado silenciosamente em 120.000)", () => {
    const text = "a".repeat(300000);
    const { chunks, truncated } = splitEditalIntoChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(EDITAL_MAX_CHUNKS);
    expect(truncated).toBe(false);
  });

  it("marca truncamento honestamente quando o edital excede EDITAL_MAX_CHUNKS chunks", () => {
    const text = "a".repeat(EDITAL_MAX_CHUNKS * EDITAL_CHUNK_SIZE * 2);
    const { chunks, truncated } = splitEditalIntoChunks(text);
    expect(chunks).toHaveLength(EDITAL_MAX_CHUNKS);
    expect(truncated).toBe(true);
  });

  it("chunks vizinhos se sobrepõem em EDITAL_CHUNK_OVERLAP chars", () => {
    const text = "a".repeat(EDITAL_CHUNK_SIZE + 10000);
    const { chunks } = splitEditalIntoChunks(text);
    expect(chunks).toHaveLength(2);
    // O início do 2º chunk (posição CHUNK_SIZE - OVERLAP) deve estar dentro do 1º chunk.
    const secondChunkStart = EDITAL_CHUNK_SIZE - EDITAL_CHUNK_OVERLAP;
    expect(secondChunkStart).toBeLessThan(chunks[0].length);
  });

  it("edital vazio produz um chunk vazio, não uma lista vazia de chunks", () => {
    const { chunks, truncated } = splitEditalIntoChunks("");
    expect(chunks).toEqual([""]);
    expect(truncated).toBe(false);
  });
});

describe("mergeEditalExtractions", () => {
  const item = (numero: number, descricao = `item ${numero}`) => ({
    numero,
    descricao,
    unidade: "UN",
    quantidade: 1,
    precoUnitario: null,
    precoTotal: null,
  });

  it("concatena itens de chunks diferentes", () => {
    const merged = mergeEditalExtractions([
      { processo: { numero: "001/2025", modalidade: "Pregão", orgao: "X", objeto: "Y" }, itens: [item(1), item(2)] },
      { processo: { numero: "", modalidade: "", orgao: "", objeto: "" }, itens: [item(3), item(4)] },
    ]);
    expect(merged.itens.map((i) => i.numero)).toEqual([1, 2, 3, 4]);
  });

  it("deduplica itens repetidos na sobreposição entre chunks, mantendo a primeira ocorrência", () => {
    const merged = mergeEditalExtractions([
      { processo: { numero: "001/2025", modalidade: "Pregão", orgao: "X", objeto: "Y" }, itens: [item(1), item(2, "descrição do chunk 1")] },
      { processo: { numero: "", modalidade: "", orgao: "", objeto: "" }, itens: [item(2, "descrição do chunk 2 (duplicata)"), item(3)] },
    ]);
    expect(merged.itens.map((i) => i.numero)).toEqual([1, 2, 3]);
    expect(merged.itens.find((i) => i.numero === 2)?.descricao).toBe("descrição do chunk 1");
  });

  it("usa os metadados do processo do primeiro chunk que os tiver preenchidos", () => {
    const merged = mergeEditalExtractions([
      { processo: { numero: "", modalidade: "", orgao: "", objeto: "" }, itens: [] },
      { processo: { numero: "042/2026", modalidade: "Dispensa", orgao: "Prefeitura X", objeto: "Compra Y" }, itens: [] },
    ]);
    expect(merged.processo.numero).toBe("042/2026");
  });

  it("nunca falha com lista vazia de extrações", () => {
    const merged = mergeEditalExtractions([]);
    expect(merged.itens).toEqual([]);
    expect(merged.processo.numero).toBe("");
  });
});
