import { describe, expect, it } from "vitest";
import { isPublicIp } from "./safeRemoteImageService";

describe("remote image network boundary", () => {
  it("blocks loopback, RFC1918, link-local and ULA destinations", () => {
    for (const address of [
      "127.0.0.1",
      "10.10.0.1",
      "172.16.1.2",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
    ]) {
      expect(isPublicIp(address), address).toBe(false);
    }
  });

  it("accepts ordinary public addresses", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("1.1.1.1")).toBe(true);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
  });
});
