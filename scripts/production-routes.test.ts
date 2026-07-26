import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type RouteManifest = {
  public: string[];
  authenticated: string[];
  editor: string[];
  admin: string[];
  redirects: Record<string, string>;
  dynamic: string[];
  critical: string[];
};

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const appSource = fs.readFileSync(path.join(repositoryRoot, "client/src/App.tsx"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "scripts/production-routes.json"), "utf8"),
) as RouteManifest;

function extractDeclaredRoutes(source: string): string[] {
  return [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);
}

function extractDeclaredRedirects(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(
      /<Route\s+path="([^"]+)">\s*<Redirect\s+to="([^"]+)"\s*\/>\s*<\/Route>/gs,
    )].map((match) => [match[1], match[2]]),
  );
}

function allManifestRoutes(): string[] {
  return [
    ...manifest.public,
    ...manifest.authenticated,
    ...manifest.editor,
    ...manifest.admin,
    ...Object.keys(manifest.redirects),
    ...manifest.dynamic,
  ];
}

describe("manifesto de rotas do smoke de produção", () => {
  it("cobre toda rota literal declarada no frontend", () => {
    const declaredRoutes = extractDeclaredRoutes(appSource);
    const coveredRoutes = allManifestRoutes();

    expect(new Set(declaredRoutes).size).toBe(declaredRoutes.length);
    expect(new Set(coveredRoutes).size).toBe(coveredRoutes.length);
    expect([...coveredRoutes].sort()).toEqual([...declaredRoutes].sort());
  });

  it("mantém rotas críticas dentro das rotas navegáveis", () => {
    const navigable = new Set([
      ...manifest.authenticated,
      ...manifest.editor,
      ...manifest.admin,
    ]);

    for (const route of manifest.critical) {
      expect(navigable.has(route), `Rota crítica sem classificação: ${route}`).toBe(true);
    }
  });

  it("preserva exatamente os destinos e parâmetros dos redirecionamentos", () => {
    expect(manifest.redirects).toEqual(extractDeclaredRedirects(appSource));

    const knownTargets = new Set([
      ...manifest.public,
      ...manifest.authenticated,
      ...manifest.editor,
      ...manifest.admin,
      ...manifest.dynamic,
    ]);

    for (const [source, target] of Object.entries(manifest.redirects)) {
      const targetPath = target.split("?")[0];
      expect(source.startsWith("/")).toBe(true);
      expect(target.startsWith("/")).toBe(true);
      expect(knownTargets.has(targetPath), `${source} aponta para rota não catalogada: ${target}`).toBe(true);
    }
  });
});
