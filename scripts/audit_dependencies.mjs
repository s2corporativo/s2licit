import fs from 'node:fs';
import path from 'node:path';

const root = '/home/ubuntu/sistema-s2-impl';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sourceDirs = ['client/src', 'server', 'drizzle', 'scripts'];
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (exts.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

const files = sourceDirs.flatMap((dir) => walk(path.join(root, dir), []));
const content = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

function isUsed(dep) {
  const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`from\\s+['\"]${escaped}['\"]`),
    new RegExp(`import\\s*\\(\\s*['\"]${escaped}['\"]\\s*\\)`),
    new RegExp(`require\\(\\s*['\"]${escaped}['\"]\\s*\\)`),
    new RegExp(`['\"]${escaped}/`),
  ];
  return patterns.some((pattern) => pattern.test(content));
}

function summarize(deps) {
  return Object.keys(deps || {}).sort().map((dep) => ({ dep, used: isUsed(dep) }));
}

const dependencies = summarize(pkg.dependencies);
const devDependencies = summarize(pkg.devDependencies);

const result = {
  dependency_count: dependencies.length,
  dev_dependency_count: devDependencies.length,
  unused_dependencies: dependencies.filter((item) => !item.used).map((item) => item.dep),
  unused_dev_dependencies: devDependencies.filter((item) => !item.used).map((item) => item.dep),
  used_dependencies_sample: dependencies.filter((item) => item.used).slice(0, 30).map((item) => item.dep),
  used_dev_dependencies_sample: devDependencies.filter((item) => item.used).slice(0, 30).map((item) => item.dep),
};

console.log(JSON.stringify(result, null, 2));
