import { describe, expect, it } from "vitest";
import {
  ALL_STATUS,
  ALL_SUPPLIERS,
  mapStatusFilterValue,
  mapSupplierFilterValue,
} from "./CaptureReview";

describe("CaptureReview filter helpers", () => {
  it("usa sentinelas não vazias para os filtros do Select", () => {
    expect(ALL_SUPPLIERS).not.toBe("");
    expect(ALL_STATUS).not.toBe("");
  });

  it("limpa o filtro de fornecedor ao receber a sentinela", () => {
    expect(mapSupplierFilterValue(ALL_SUPPLIERS)).toBeUndefined();
  });

  it("converte o filtro de fornecedor para número quando recebe um id válido", () => {
    expect(mapSupplierFilterValue("42")).toBe(42);
  });

  it("limpa o filtro de status ao receber a sentinela", () => {
    expect(mapStatusFilterValue(ALL_STATUS)).toBeUndefined();
  });

  it("preserva um status válido ao receber valor selecionado", () => {
    expect(mapStatusFilterValue("approved")).toBe("approved");
  });
});
