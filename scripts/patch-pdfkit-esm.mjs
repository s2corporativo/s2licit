// Corrige o bug do PDFKit 0.17.2 em modo ESM: os carregadores de fontes padrão e o
// perfil ICC usam __dirname, que não existe em ESM (ReferenceError silencioso que
// deixa todas as páginas do PDF em branco). Substitui por fileURLToPath(import.meta.url),
// funcionando tanto em ESM quanto em CJS.
// Executado pelo docker-entrypoint.sh antes do start da aplicação (idempotente:
// se o arquivo já estiver patcheado, nada é alterado).
import fs from "fs";
import path from "path";

// Resolve o caminho do pdfkit.es.js tanto em pnpm quanto em npm/yarn
const candidates = [
  path.resolve(import.meta.dirname, "../node_modules/.pnpm/pdfkit@0.17.2/node_modules/pdfkit/js/pdfkit.es.js"),
  path.resolve(import.meta.dirname, "../node_modules/pdfkit/js/pdfkit.es.js"),
];
const target = candidates.find((c) => fs.existsSync(c));
if (!target) {
  console.error("pdfkit.es.js não encontrado; patch ignorado");
  process.exit(0);
}

let src = fs.readFileSync(target, "utf8");

// Adiciona o import de fileURLToPath se não existir
if (!src.includes('from "path"') && !src.includes("from 'path'")) {
  // Insere após a primeira linha de import existente ou no topo
  if (!src.includes("fileURLToPath")) {
    src = `import path from "path";\nimport { fileURLToPath } from "url";\n` + src;
  } else if (!src.includes('import path from "path"') && !src.includes("import path from 'path'")) {
    src = src.replace(/^(import \{ fileURLToPath \} from "url";\n)/, '$1import path from "path";\n');
  }
}

// Define __dirname compatível ESM/CJS logo após os imports (escopo de módulo)
if (!src.includes("var __dirname =")) {
  const assign = `\n// Patch: __dirname compatível ESM (PDFKit 0.17.2 bug — fontes AFM não carregam)\nvar __dirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));\n`;
  // Localiza o fim do bloco de imports (primeira linha que não começa com "import")
  const lines = src.split("\n");
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trimStart().startsWith("import")) {
      insertAt = i;
      break;
    }
  }
  lines.splice(insertAt, 0, assign.trim());
  src = lines.join("\n");
}

fs.writeFileSync(target, src);
console.log(`PDFKit ESM patcheado: ${target}`);
