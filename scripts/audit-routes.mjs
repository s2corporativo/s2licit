import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url);
const appPath = new URL("../client/src/App.tsx", import.meta.url);
const layoutPath = new URL("../client/src/components/AppLayout.tsx", import.meta.url);
const app = readFileSync(appPath, "utf8");
const layout = readFileSync(layoutPath, "utf8");

const routePaths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1]);
const routeSet = new Set(routePaths);
const duplicates = [...new Set(routePaths.filter((path, index) => routePaths.indexOf(path) !== index))];

const navSection = layout.slice(layout.indexOf("const navGroups"), layout.indexOf("export default function"));
const navPaths = [...navSection.matchAll(/href:\s*"([^"]+)"/g)].map(match => match[1]);
const missingNavRoutes = navPaths.filter(path => !routeSet.has(path));

const redirects = [...app.matchAll(/<Route\s+path="([^"]+)"><Redirect\s+to="([^"]+)"\s*\/><\/Route>/g)]
  .map(match => ({ from: match[1], to: match[2] }));
const missingRedirectTargets = redirects.filter(({ to }) => !routeSet.has(to));

const legacyRoutes = new Set(redirects.map(({ from }) => from));
const sourceRoots = [new URL("../client/src/", import.meta.url), new URL("../server/", import.meta.url)];
const legacyReferences = [];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory.pathname, name);
    if (statSync(path).isDirectory()) {
      walk(new URL(`${name}/`, directory));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name) || path === appPath.pathname) continue;
    const content = readFileSync(path, "utf8");
    for (const legacy of legacyRoutes) {
      if (content.includes(`"${legacy}"`) || content.includes(`'${legacy}'`)) {
        legacyReferences.push(`${relative(root.pathname, path)} -> ${legacy}`);
      }
    }
  }
}

for (const directory of sourceRoots) walk(directory);

const failures = [
  ...duplicates.map(path => `rota duplicada: ${path}`),
  ...missingNavRoutes.map(path => `item de menu sem rota: ${path}`),
  ...missingRedirectTargets.map(({ from, to }) => `redirecionamento ${from} aponta para rota ausente ${to}`),
  ...legacyReferences.map(reference => `referência interna ainda usa rota legada: ${reference}`),
];

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Rotas auditadas: ${routePaths.length}; menu: ${navPaths.length}; compatibilidade: ${redirects.length}.`);
}
