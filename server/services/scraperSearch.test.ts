import { describe, it, expect } from "vitest";
import { buildSearchUrl, FORNECEDOR_CONFIGS } from "./scraperEngine";

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

describe("FORNECEDOR_CONFIGS — fornecedores cadastrados", () => {
  // Todos os fornecedores que fazem busca sob demanda precisam de um template.
  const comBusca = ["bartofil", "bassopancotte", "magazinemedica", "utilidadesclinicas"] as const;

  it.each(comBusca)("%s está registrado com os campos mínimos de login", (nome) => {
    const cfg = FORNECEDOR_CONFIGS[nome];
    expect(cfg, `preset ${nome} ausente`).toBeDefined();
    expect(cfg.loginEmail.length).toBeGreaterThan(0);
    expect(cfg.loginPassword.length).toBeGreaterThan(0);
    expect(cfg.loginSubmit.length).toBeGreaterThan(0);
    expect(cfg.productItem.length).toBeGreaterThan(0);
  });

  it.each(comBusca)("%s tem searchUrlTemplate que produz URL válida com {q}", (nome) => {
    const tpl = FORNECEDOR_CONFIGS[nome].searchUrlTemplate;
    expect(tpl, `template de busca ausente em ${nome}`).toBeTruthy();
    const url = buildSearchUrl(tpl!, "seringa 5ml");
    expect(() => new URL(url)).not.toThrow();
    expect(url).toContain("seringa%205ml");
  });

  it("utilidadesclinicas (Magento) usa os seletores reais confirmados", () => {
    const cfg = FORNECEDOR_CONFIGS.utilidadesclinicas;
    expect(cfg.loginUrl).toBe("https://www.utilidadesclinicas.com.br/customer/account/login/");
    // Campo aceita e-mail ou CPF/CNPJ (name="login[username]").
    expect(cfg.loginEmail).toContain('login[username]');
    expect(cfg.loginPassword).toContain('login[password]');
    expect(cfg.loginSubmit).toContain("#send2");
    // Sinal de sessão autenticada (logout no cabeçalho Magento).
    expect(cfg.loginSuccessSelector).toContain("logout");
  });

  it("magazinemedica (Django) usa os seletores reais confirmados", () => {
    const cfg = FORNECEDOR_CONFIGS.magazinemedica;
    expect(cfg.loginUrl).toBe("https://magazinemedica.com.br/accounts/login/");
    expect(cfg.loginEmail).toContain("#id_username");
    expect(cfg.loginPassword).toContain("#id_password");
    expect(cfg.loginSubmit).toContain("#login_entrar");
    // Redireciona para /accounts/ ao logar (campo hidden next).
    expect(cfg.loginSuccessUrl).toBe("/accounts/");
    // Busca real usa o parâmetro keywords, não q.
    expect(cfg.searchUrlTemplate).toContain("keywords=");
  });
});
