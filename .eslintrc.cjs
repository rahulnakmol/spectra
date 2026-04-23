module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-console": ["error", { allow: ["warn", "error"] }],
    "eqeqeq": ["error", "always"]
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**"],
      rules: { "@typescript-eslint/no-floating-promises": "off" }
    }
  ],
  env: { node: true, es2022: true }
};
