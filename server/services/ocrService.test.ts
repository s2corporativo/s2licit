import { describe, it, expect } from "vitest";
import { isOcrSupportedMime, mimeParaOcr } from "./ocrService";

describe("isOcrSupportedMime (§2)", () => {
  it("reconhece imagens por mimetype", () => {
    expect(isOcrSupportedMime("image/png")).toBe(true);
    expect(isOcrSupportedMime("image/jpeg")).toBe(true);
    expect(isOcrSupportedMime("image/webp")).toBe(true);
  });

  it("reconhece imagens pela extensão do arquivo", () => {
    expect(isOcrSupportedMime("", "pedido.JPG")).toBe(true);
    expect(isOcrSupportedMime("application/octet-stream", "scan.png")).toBe(true);
  });

  it("não trata PDF/DOCX/texto como imagem", () => {
    expect(isOcrSupportedMime("application/pdf", "edital.pdf")).toBe(false);
    expect(isOcrSupportedMime("text/plain", "lista.txt")).toBe(false);
    expect(isOcrSupportedMime("", "documento.docx")).toBe(false);
  });
});

describe("mimeParaOcr", () => {
  it("usa o mimetype quando é imagem conhecida", () => {
    expect(mimeParaOcr("image/jpeg", "x.png")).toBe("image/jpeg");
  });

  it("deriva da extensão quando o mimetype é genérico", () => {
    expect(mimeParaOcr("application/octet-stream", "pedido.jpg")).toBe("image/jpeg");
    expect(mimeParaOcr("application/octet-stream", "scan.webp")).toBe("image/webp");
    expect(mimeParaOcr("", "foto.PNG")).toBe("image/png");
  });

  it("cai em image/png sem pistas", () => {
    expect(mimeParaOcr("application/octet-stream", "arquivo")).toBe("image/png");
  });
});
