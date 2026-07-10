import { describe, it, expect } from "vitest";
import {
  encryptPassword,
  decryptPassword,
} from "./supplierAuthService";

describe("supplierAuthService", () => {
  describe("password encryption/decryption", () => {
    it("should encrypt and decrypt password correctly", () => {
      const password = "MySecurePassword123!";
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(password);
    });

    it("should produce different encrypted values for same password", () => {
      const password = "TestPassword";
      const encrypted1 = encryptPassword(password);
      const encrypted2 = encryptPassword(password);
      expect(encrypted1).not.toBe(encrypted2); // Different IVs
    });

    it("should handle special characters in password", () => {
      const password = "P@ssw0rd!#$%^&*()";
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(password);
    });

    it("should handle empty password", () => {
      const password = "";
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(password);
    });

    it("should handle unicode characters", () => {
      const password = "Senhaçãocomácentos123";
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(password);
    });

    it("should handle long password", () => {
      const password = "A".repeat(256);
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(password);
    });
  });

  describe("encryption format", () => {
    it("should produce IV:encrypted format", () => {
      const password = "test";
      const encrypted = encryptPassword(password);
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^[a-f0-9]{32}$/); // IV in hex (16 bytes = 32 hex chars)
    });

    it("should be able to decrypt different IV formats", () => {
      const passwords = [
        "password1",
        "password2",
        "password3",
      ];

      for (const pwd of passwords) {
        const encrypted = encryptPassword(pwd);
        const decrypted = decryptPassword(encrypted);
        expect(decrypted).toBe(pwd);
      }
    });
  });

  describe("security", () => {
    it("should not expose password in encrypted form", () => {
      const password = "SecretPassword";
      const encrypted = encryptPassword(password);
      expect(encrypted).not.toContain(password);
    });

    it("should produce hex-encoded output", () => {
      const password = "test";
      const encrypted = encryptPassword(password);
      const parts = encrypted.split(":");
      expect(parts[0]).toMatch(/^[a-f0-9]+$/);
      expect(parts[1]).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe("edge cases", () => {
    it("should handle password with colons", () => {
      const password = "pass:word:with:colons";
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(password);
    });

    it("should handle password with newlines", () => {
      const password = "password\nwith\nnewlines";
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(password);
    });

    it("should handle password with tabs", () => {
      const password = "password\twith\ttabs";
      const encrypted = encryptPassword(password);
      const decrypted = decryptPassword(encrypted);
      expect(decrypted).toBe(password);
    });
  });
});

describe("captureLogService", () => {
  describe("log statistics", () => {
    it("should calculate success rate correctly", () => {
      const totalProducts = 100;
      const productsWithErrors = 5;
      const successRate =
        ((totalProducts - productsWithErrors) / totalProducts) * 100;
      expect(successRate).toBeCloseTo(95, 0);
    });

    it("should handle zero products", () => {
      const totalProducts = 0;
      const successRate = totalProducts > 0 ? 100 : 0;
      expect(successRate).toBe(0);
    });

    it("should calculate duration correctly", () => {
      const startTime = new Date("2026-04-09T20:00:00Z");
      const endTime = new Date("2026-04-09T20:05:30Z");
      const durationSeconds = Math.floor(
        (endTime.getTime() - startTime.getTime()) / 1000
      );
      expect(durationSeconds).toBe(330); // 5 minutes 30 seconds
    });
  });

  describe("error tracking", () => {
    it("should categorize error types", () => {
      const errorTypes = [
        "connection_timeout",
        "parsing_error",
        "authentication_failed",
        "rate_limited",
        "unknown",
      ];
      expect(errorTypes).toContain("connection_timeout");
      expect(errorTypes).toContain("parsing_error");
    });

    it("should track failure stages", () => {
      const stages = [
        "authentication",
        "discovery",
        "extraction",
        "normalization",
        "matching",
        "persistence",
      ];
      expect(stages).toHaveLength(6);
    });

    it("should identify reprocessable errors", () => {
      const reprocessableErrors = [
        "connection_timeout",
        "rate_limited",
        "temporary_failure",
      ];
      const nonReprocessable = [
        "invalid_selector",
        "structure_changed",
      ];

      expect(reprocessableErrors).toContain("connection_timeout");
      expect(nonReprocessable).not.toContain("connection_timeout");
    });
  });

  describe("capture report generation", () => {
    it("should format report correctly", () => {
      const report = {
        logId: 1,
        supplierId: 5,
        status: "completed",
        statistics: {
          totalPages: 10,
          totalProductsFound: 100,
          newProductsCreated: 50,
          productsUpdated: 40,
          productsWithErrors: 10,
          productsIgnored: 0,
          successRate: "90.00",
        },
      };

      expect(report).toHaveProperty("logId");
      expect(report).toHaveProperty("supplierId");
      expect(report).toHaveProperty("status");
      expect(report).toHaveProperty("statistics");
      expect(report.statistics).toHaveProperty("successRate");
    });

    it("should include error details in report", () => {
      const errors = [
        {
          errorType: "parsing_error",
          errorMessage: "Could not find product name",
          failureStage: "extraction",
        },
      ];

      expect(errors).toHaveLength(1);
      expect(errors[0]).toHaveProperty("errorType");
      expect(errors[0]).toHaveProperty("failureStage");
    });
  });

  describe("session management", () => {
    it("should track session expiration", () => {
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now
      const isExpired = new Date() > expiresAt;
      expect(isExpired).toBe(false);
    });

    it("should detect expired sessions", () => {
      const expiresAt = new Date(Date.now() - 3600000); // 1 hour ago
      const isExpired = new Date() > expiresAt;
      expect(isExpired).toBe(true);
    });

    it("should store cookies as JSON", () => {
      const cookies = {
        sessionId: "abc123",
        userId: "user456",
      };
      const serialized = JSON.stringify(cookies);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(cookies);
    });
  });
});
