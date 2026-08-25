import { describe, expect, it } from "vitest";
import { sanitizeReadinessError } from "./readinessPolicy";

describe("health security", () => {
  it("oculta detalhe interno", () => {
    expect(sanitizeReadinessError(new Error("mysql://secret@db"))).toEqual({ status: "not_ready", database: "error", error: "Falha de prontidão" });
  });
});
