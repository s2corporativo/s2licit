import { describe, it, expect } from "vitest";
import { puppeteerCookiesToRecord, recordToPuppeteerCookies } from "./sessionCookies";

describe("puppeteerCookiesToRecord", () => {
  it("converte cookies do navegador em nome→valor", () => {
    const rec = puppeteerCookiesToRecord([
      { name: "session", value: "abc" },
      { name: "csrf", value: "xyz" },
    ]);
    expect(rec).toEqual({ session: "abc", csrf: "xyz" });
  });

  it("ignora entradas inválidas e entrada não-array", () => {
    expect(puppeteerCookiesToRecord(null)).toEqual({});
    expect(puppeteerCookiesToRecord(undefined)).toEqual({});
    const rec = puppeteerCookiesToRecord([
      { name: "", value: "x" } as any,
      { name: "ok", value: "1" },
    ]);
    expect(rec).toEqual({ ok: "1" });
  });
});

describe("recordToPuppeteerCookies", () => {
  it("aplica cada cookie à URL alvo", () => {
    const cookies = recordToPuppeteerCookies({ session: "abc", csrf: "xyz" }, "https://forn.com");
    expect(cookies).toEqual([
      { name: "session", value: "abc", url: "https://forn.com" },
      { name: "csrf", value: "xyz", url: "https://forn.com" },
    ]);
  });

  it("retorna vazio sem record ou sem URL", () => {
    expect(recordToPuppeteerCookies(null, "https://x")).toEqual([]);
    expect(recordToPuppeteerCookies({ a: "1" }, "")).toEqual([]);
  });

  it("round-trip preserva os pares nome→valor", () => {
    const original = [
      { name: "session", value: "abc" },
      { name: "csrf", value: "xyz" },
    ];
    const rec = puppeteerCookiesToRecord(original);
    const back = recordToPuppeteerCookies(rec, "https://forn.com");
    expect(back.map((c) => ({ name: c.name, value: c.value }))).toEqual(original);
  });
});
