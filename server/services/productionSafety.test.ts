import { describe, expect, it } from "vitest";
import { automaticEmailReportsEnabled } from "./productionSafety";

describe("productionSafety", () => {
  it("mantém relatórios automáticos de e-mail desligados", () => {
    expect(automaticEmailReportsEnabled()).toBe(false);
  });
});
