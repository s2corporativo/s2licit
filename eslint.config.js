// Configuração mínima de ESLint (flat config) focada em HIGIENE: remover
// imports não usados automaticamente. Não impõe estilo — só limpa. Rode com
// `pnpm run lint` (checar) ou `pnpm run lint:fix` (corrigir).
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "drizzle/meta/**", "**/*.d.ts"],
  },
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Registra o plugin @typescript-eslint (regras desligadas) só para que
    // comentários `eslint-disable @typescript-eslint/...` já existentes no
    // código resolvam o nome da regra e não quebrem o lint.
    plugins: { "unused-imports": unusedImports, "@typescript-eslint": tseslint.plugin },
    rules: {
      "unused-imports/no-unused-imports": "error",
    },
    linterOptions: { reportUnusedDisableDirectives: false },
  },
);
