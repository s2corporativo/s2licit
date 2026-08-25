import { describe, expect, it } from "vitest";
import { readinessErrorPayload } from "./readinessResponse";

describe("readinessResponse", () => {
  it("não expõe mensagem interna", () => {
    expect(readinessErrorPayload()).toEqual({ status: "not_ready", database: "error", error: "Falha de prontidão" });
  });
});
