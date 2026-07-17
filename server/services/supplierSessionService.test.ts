import { describe, it, expect } from "vitest";
import { supplierSessionService } from "./supplierSessionService";
import type { SupplierSession } from "../../drizzle/schema";

/** Monta um SupplierSession mínimo para os parsers (só os campos usados). */
function fakeSession(over: Partial<SupplierSession>): SupplierSession {
  return {
    id: 1,
    supplierId: 1,
    cookies: null,
    localStorage: null,
    sessionToken: null,
    authHeader: null,
    status: "active",
    lastAuthAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as SupplierSession;
}

describe("supplierSessionService — parsing de sessão", () => {
  it("parseLocalStorage devolve o objeto quando o JSON é válido", () => {
    const s = fakeSession({ localStorage: JSON.stringify({ token: "abc", uid: "7" }) });
    expect(supplierSessionService.parseLocalStorage(s)).toEqual({ token: "abc", uid: "7" });
  });

  it("parseLocalStorage devolve {} para nulo ou JSON inválido", () => {
    expect(supplierSessionService.parseLocalStorage(fakeSession({ localStorage: null }))).toEqual({});
    expect(supplierSessionService.parseLocalStorage(fakeSession({ localStorage: "{quebrado" }))).toEqual({});
  });

  it("parseCookies continua funcionando de forma independente", () => {
    const s = fakeSession({ cookies: JSON.stringify({ sid: "1" }) });
    expect(supplierSessionService.parseCookies(s)).toEqual({ sid: "1" });
  });
});
