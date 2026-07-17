import { describe, it, expect } from "vitest";
import { buildSearchUrl } from "./scraperEngine";

describe("buildSearchUrl (§4/§5)", () => {
  it("substitui o placeholder {q} e codifica o termo", () => {
    expect(buildSearchUrl("https://s.com/busca?q={q}", "seringa 5ml")).toBe(
      "https://s.com/busca?q=seringa%205ml",
    );
  });

  it("aceita o placeholder {termo} (case-insensitive)", () => {
    expect(buildSearchUrl("https://s.com/p/{TERMO}", "gaze")).toBe("https://s.com/p/gaze");
  });

  it("anexa ?q= quando não há placeholder", () => {
    expect(buildSearchUrl("https://s.com/busca", "álcool")).toBe("https://s.com/busca?q=%C3%A1lcool");
  });

  it("anexa &q= quando já existe query string", () => {
    expect(buildSearchUrl("https://s.com/busca?cat=med", "luva")).toBe("https://s.com/busca?cat=med&q=luva");
  });

  it("apara espaços do termo", () => {
    expect(buildSearchUrl("https://s.com?q={q}", "  agulha  ")).toBe("https://s.com?q=agulha");
  });
});
