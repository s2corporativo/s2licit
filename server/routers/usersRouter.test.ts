import { describe, it, expect } from "vitest";
import { ehUltimoAdmin } from "./usersRouter";

describe("ehUltimoAdmin", () => {
  const base = [
    { id: 1, role: "admin" },
    { id: 2, role: "editor" },
    { id: 3, role: "viewer" },
  ];

  it("é verdadeiro quando o alvo é o único admin", () => {
    expect(ehUltimoAdmin(base, 1)).toBe(true);
  });

  it("é falso quando há outro admin", () => {
    expect(ehUltimoAdmin([...base, { id: 4, role: "admin" }], 1)).toBe(false);
  });

  it("é falso quando o alvo não é admin", () => {
    expect(ehUltimoAdmin(base, 2)).toBe(false);
  });

  it("é falso quando não há admins", () => {
    expect(ehUltimoAdmin([{ id: 1, role: "editor" }], 1)).toBe(false);
  });
});
