import { describe, expect, it } from "vitest";
import { assertSafeExternalUrl, isNonPublicIp } from "./urlGuard";

describe("urlGuard", () => {
  it("blocks private/reserved IPv4 ranges", () => {
    const blocked = [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "198.18.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
    ];
    for (const address of blocked) expect(isNonPublicIp(address), address).toBe(true);
  });

  it("blocks loopback, link-local, ULA and IPv4-mapped IPv6", () => {
    const blocked = [
      "::1",
      "::",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:c0a8:0101",
    ];
    for (const address of blocked) expect(isNonPublicIp(address), address).toBe(true);
  });

  it("accepts representative public IPs", () => {
    expect(isNonPublicIp("8.8.8.8")).toBe(false);
    expect(isNonPublicIp("1.1.1.1")).toBe(false);
    expect(isNonPublicIp("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks dangerous URL syntax before DNS resolution", () => {
    const blocked = [
      "file:///etc/passwd",
      "ftp://example.com/file",
      "http://localhost/admin",
      "http://service.local/api",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://user:password@example.com/",
    ];
    for (const rawUrl of blocked) {
      expect(() => assertSafeExternalUrl(rawUrl), rawUrl).toThrow();
    }
  });

  it("normalizes and accepts public HTTP(S) URLs", () => {
    expect(assertSafeExternalUrl("https://pncp.gov.br/api/consulta").protocol).toBe("https:");
    expect(assertSafeExternalUrl("http://example.com/path").hostname).toBe("example.com");
  });
});
