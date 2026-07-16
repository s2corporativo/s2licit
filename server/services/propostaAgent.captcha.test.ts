import { describe, it, expect } from "vitest";
import { detectarDesafioCaptcha, CaptchaRequerIntervencaoError } from "./propostaAgent";

/**
 * Conformidade (spec §3 e §17): o agente NÃO deve resolver/burlar CAPTCHA;
 * deve apenas detectá-lo e exigir intervenção humana. Estes testes garantem
 * que a detecção reconhece os desafios comuns — e não computa respostas.
 */
describe("detectarDesafioCaptcha", () => {
  it("detecta CAPTCHA matemático (não resolve, apenas sinaliza)", () => {
    const r = detectarDesafioCaptcha("Bem-vindo. Quanto é 6 - 4? Responda para continuar.");
    expect(r.detectado).toBe(true);
    expect(r.tipo).toBe("captcha_matematico");
    // O retorno não contém nenhuma resposta calculada — só o diagnóstico.
    expect(Object.keys(r)).toEqual(expect.arrayContaining(["detectado", "tipo"]));
    expect(r).not.toHaveProperty("resposta");
  });

  it("detecta variações do CAPTCHA matemático (soma e multiplicação)", () => {
    expect(detectarDesafioCaptcha("Quanto é 3 + 2?").tipo).toBe("captcha_matematico");
    expect(detectarDesafioCaptcha("Quanto e 7 x 8 ?").tipo).toBe("captcha_matematico");
  });

  it("detecta reCAPTCHA e hCaptcha", () => {
    expect(detectarDesafioCaptcha("Protegido por reCAPTCHA").tipo).toBe("recaptcha");
    expect(detectarDesafioCaptcha("This site uses hCaptcha").tipo).toBe("hcaptcha");
  });

  it("detecta CAPTCHA genérico e 'não sou um robô'", () => {
    expect(detectarDesafioCaptcha("Digite o CAPTCHA acima").detectado).toBe(true);
    expect(detectarDesafioCaptcha("Marque: Não sou um robô").detectado).toBe(true);
    expect(detectarDesafioCaptcha("Informe o código de verificação").detectado).toBe(true);
  });

  it("não gera falso positivo em página de login comum", () => {
    const r = detectarDesafioCaptcha("Informe seu usuário e senha para entrar no portal.");
    expect(r.detectado).toBe(false);
    expect(r.tipo).toBeUndefined();
  });

  it("é resiliente a entrada vazia/indefinida", () => {
    expect(detectarDesafioCaptcha("").detectado).toBe(false);
    expect(detectarDesafioCaptcha(undefined as unknown as string).detectado).toBe(false);
  });
});

describe("CaptchaRequerIntervencaoError", () => {
  it("marca a necessidade de intervenção humana", () => {
    const e = new CaptchaRequerIntervencaoError("CAPTCHA detectado");
    expect(e).toBeInstanceOf(Error);
    expect(e.requerIntervencaoHumana).toBe(true);
    expect(e.name).toBe("CaptchaRequerIntervencaoError");
  });
});
