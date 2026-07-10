import { describe, it, expect, vi } from "vitest";
import {
  detectImageColumn,
  extractImageUrls,
  normalizeImageUrl,
  getFileNameFromUrl,
  generateThumbnailUrl,
} from "./productImageService";

describe("productImageService", () => {
  describe("detectImageColumn", () => {
    it("should detect image column with common names", () => {
      const headers = ["name", "price", "image", "description"];
      const result = detectImageColumn(headers);
      expect(result).toBe(2);
    });

    it("should detect imageUrl column", () => {
      const headers = ["produto", "valor", "imageUrl", "fornecedor"];
      const result = detectImageColumn(headers);
      expect(result).toBe(2);
    });

    it("should detect image_url column", () => {
      const headers = ["name", "image_url", "price"];
      const result = detectImageColumn(headers);
      expect(result).toBe(1);
    });

    it("should detect imagem column (Portuguese)", () => {
      const headers = ["nome", "preço", "imagem", "fornecedor"];
      const result = detectImageColumn(headers);
      expect(result).toBe(2);
    });

    it("should detect foto column", () => {
      const headers = ["produto", "foto", "preco"];
      const result = detectImageColumn(headers);
      expect(result).toBe(1);
    });

    it("should detect url_imagem column", () => {
      const headers = ["nome", "url_imagem", "valor"];
      const result = detectImageColumn(headers);
      expect(result).toBe(1);
    });

    it("should return null if no image column found", () => {
      const headers = ["name", "price", "description"];
      const result = detectImageColumn(headers);
      expect(result).toBeNull();
    });

    it("should be case insensitive", () => {
      const headers = ["Name", "IMAGE", "Price"];
      const result = detectImageColumn(headers);
      expect(result).toBe(1);
    });

    it("should handle headers with spaces and underscores", () => {
      const headers = ["name", "product image", "price"];
      const result = detectImageColumn(headers);
      expect(result).toBe(1);
    });
  });

  describe("extractImageUrls", () => {
    it("should extract single URL", () => {
      const text = "https://example.com/image.jpg";
      const result = extractImageUrls(text);
      expect(result).toEqual(["https://example.com/image.jpg"]);
    });

    it("should extract multiple URLs separated by comma", () => {
      const text =
        "https://example.com/image1.jpg, https://example.com/image2.jpg";
      const result = extractImageUrls(text);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe("https://example.com/image1.jpg");
      expect(result[1]).toBe("https://example.com/image2.jpg");
    });

    it("should extract multiple URLs separated by semicolon", () => {
      const text =
        "https://example.com/image1.jpg; https://example.com/image2.jpg";
      const result = extractImageUrls(text);
      expect(result).toHaveLength(2);
    });

    it("should extract multiple URLs separated by pipe", () => {
      const text =
        "https://example.com/image1.jpg | https://example.com/image2.jpg";
      const result = extractImageUrls(text);
      expect(result).toHaveLength(2);
    });

    it("should extract multiple URLs separated by newline", () => {
      const text =
        "https://example.com/image1.jpg\nhttps://example.com/image2.jpg";
      const result = extractImageUrls(text);
      expect(result).toHaveLength(2);
    });

    it("should ignore non-URL text", () => {
      const text =
        "https://example.com/image.jpg, https://example.com/image2.jpg";
      const result = extractImageUrls(text);
      expect(result).toHaveLength(2);
    });

    it("should handle empty string", () => {
      const result = extractImageUrls("");
      expect(result).toEqual([]);
    });

    it("should handle null", () => {
      const result = extractImageUrls(null as any);
      expect(result).toEqual([]);
    });

    it("should support http URLs", () => {
      const text = "http://example.com/image.jpg";
      const result = extractImageUrls(text);
      expect(result).toEqual(["http://example.com/image.jpg"]);
    });
  });

  describe("normalizeImageUrl", () => {
    it("should return URL as-is if already valid", () => {
      const url = "https://example.com/image.jpg";
      const result = normalizeImageUrl(url);
      expect(result).toBe(url);
    });

    it("should add https protocol if missing", () => {
      const url = "example.com/image.jpg";
      const result = normalizeImageUrl(url);
      expect(result).toBe("https://example.com/image.jpg");
    });

    it("should trim whitespace", () => {
      const url = "  https://example.com/image.jpg  ";
      const result = normalizeImageUrl(url);
      expect(result).toBe("https://example.com/image.jpg");
    });

    it("should handle http protocol", () => {
      const url = "http://example.com/image.jpg";
      const result = normalizeImageUrl(url);
      expect(result).toBe("http://example.com/image.jpg");
    });

    it("should return empty string for empty input", () => {
      const result = normalizeImageUrl("");
      expect(result).toBe("");
    });

    it("should return empty string for null", () => {
      const result = normalizeImageUrl(null as any);
      expect(result).toBe("");
    });
  });

  describe("getFileNameFromUrl", () => {
    it("should extract filename from URL", () => {
      const url = "https://example.com/images/product.jpg";
      const result = getFileNameFromUrl(url);
      expect(result).toBe("product.jpg");
    });

    it("should handle URLs with query parameters", () => {
      const url = "https://example.com/images/product.jpg?size=large";
      const result = getFileNameFromUrl(url);
      expect(result).toBe("product.jpg");
    });

    it("should handle URLs with hash", () => {
      const url = "https://example.com/images/product.jpg#section";
      const result = getFileNameFromUrl(url);
      expect(result).toBe("product.jpg");
    });

    it("should return default name for invalid URL", () => {
      const url = "not-a-url";
      const result = getFileNameFromUrl(url);
      expect(result).toBe("image.jpg");
    });

    it("should handle URLs ending with slash", () => {
      const url = "https://example.com/images/";
      const result = getFileNameFromUrl(url);
      expect(result).toBe("image.jpg");
    });
  });

  describe("generateThumbnailUrl", () => {
    it("should return original URL if not Cloudinary or Imgix", () => {
      const url = "https://example.com/image.jpg";
      const result = generateThumbnailUrl(url, 40, 40);
      expect(result).toBe(url);
    });

    it("should add Cloudinary transformations", () => {
      const url = "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg";
      const result = generateThumbnailUrl(url, 40, 40);
      expect(result).toContain("w_40");
      expect(result).toContain("h_40");
      expect(result).toContain("c_fill");
    });

    it("should add Imgix parameters", () => {
      const url = "https://demo.imgix.net/image.jpg";
      const result = generateThumbnailUrl(url, 40, 40);
      expect(result).toContain("w=40");
      expect(result).toContain("h=40");
      expect(result).toContain("fit=crop");
    });

    it("should handle custom dimensions", () => {
      const url = "https://example.com/image.jpg";
      const result = generateThumbnailUrl(url, 100, 100);
      expect(result).toBe(url);
    });

    it("should return empty string for empty URL", () => {
      const result = generateThumbnailUrl("", 40, 40);
      expect(result).toBe("");
    });
  });
});
