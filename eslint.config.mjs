import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    files: ["**/*.ts"],

    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },

    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },

    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],

      curly: ["warn", "multi-or-nest", "consistent"],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-throw-literal": "warn",
      semi: "off",
    },
  },
]);
