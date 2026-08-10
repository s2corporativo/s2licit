import { describe, expect, it } from "vitest";
import {
  COOKIE_JAR_V2_KEY,
  cookieRecordToHeader,
  puppeteerCookiesToRecord,
  recordToPuppeteerCookies,
} from "./sessionCookies";

describe("puppeteerCookiesToRecord", () => {
  it("mantém formato simples quando só há nome→valor", () => {
    const rec = puppeteerCookiesToRecord([
      { name: "session", value: "abc" },
      { name: "csrf", value: "xyz" },
    ]);
    expect(rec).toEqual({ session: "abc", csrf: "xyz" });
  });

  it("persiste cookie jar v2 quando há metadados", () => {
    const rec = puppeteerCookiesToRecord([
      {
        name: "session",
        value: "abc",
        domain: ".forn.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect(rec.session).toBe("abc");
    expect(rec[COOKIE_JAR_V2_KEY]).toBeTruthy();
    expect(JSON.parse(rec[COOKIE_JAR_V2_KEY])[0]).toMatchObject({
      name: "session",
      domain: ".forn.com",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
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
  it("mantém compatibilidade com registro legado", () => {
    const cookies = recordToPuppeteerCookies({ session: "abc", csrf: "xyz" }, "https://forn.com");
    expect(cookies).toEqual([
      { name: "session", value: "abc", url: "https://forn.com" },
      { name: "csrf", value: "xyz", url: "https://forn.com" },
    ]);
  });

  it("restaura domínio/path/flags no formato v2", () => {
    const record = puppeteerCookiesToRecord([
      {
        name: "session",
        value: "abc",
        domain: ".forn.com",
        path: "/cliente",
        secure: true,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    expect(recordToPuppeteerCookies(record, "https://forn.com/login")).toEqual([
      {
        name: "session",
        value: "abc",
        domain: ".forn.com",
        path: "/cliente",
        secure: true,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
  });

  it("usa URL apenas para cookie host-only sem domínio", () => {
    const record = puppeteerCookiesToRecord([
      { name: "session", value: "abc", path: "/", secure: true },
    ]);
    expect(recordToPuppeteerCookies(record, "https://forn.com/login")[0]).toMatchObject({
      name: "session",
      value: "abc",
      path: "/",
      secure: true,
      url: "https://forn.com/login",
    });
  });

  it("retorna vazio sem record ou sem URL", () => {
    expect(recordToPuppeteerCookies(null, "https://x")).toEqual([]);
    expect(recordToPuppeteerCookies({ a: "1" }, "")).toEqual([]);
  });

  it("header HTTP ignora metadados internos", () => {
    const record = puppeteerCookiesToRecord([
      { name: "session", value: "abc", domain: ".forn.com", secure: true },
      { name: "csrf", value: "xyz" },
    ]);
    expect(cookieRecordToHeader(record)).toBe("session=abc; csrf=xyz");
  });
});
