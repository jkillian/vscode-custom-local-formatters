import { defineConfig } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default defineConfig([{
    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        parser: tsParser,
        ecmaVersion: 6,
        sourceType: "module",
    },

    rules: {
        curly: ["warn", "multi-or-nest", "consistent"],

        eqeqeq: ["error", "always", {
            null: "ignore",
        }],

        "no-throw-literal": "warn",
        semi: "off",
    },
}]);