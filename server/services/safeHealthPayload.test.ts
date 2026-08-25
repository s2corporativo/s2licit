import { describe, expect, it } from "vitest";
import { safeHealthFailure } from "./safeHealthPayload";

describe("safeHealthPayload", () => {
  it("retorna erro genérico", () => expect(safeHealthFailure().error).toBe("Falha de prontidão"));
});
