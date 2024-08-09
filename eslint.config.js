import cinnabarPlugin from "@cinnabar-forge/eslint-plugin";

// [ANCA-ANCHOR-CUSTOM-CONTENT-START]

const files = ["src/**/*.ts"];
const ignores = ["bin/**/*", "build/**/*", "dist/**/*"];
const rules = {
  "@typescript-eslint/no-explicit-any": "off",
  "jsdoc/require-param-description": "off",
  "jsdoc/require-param-type": "off",
  "jsdoc/require-returns": "off",
  "jsdoc/require-returns-type": "off",
  "security/detect-non-literal-fs-filename": "off",
  "security/detect-object-injection": "off",
};

// [ANCA-ANCHOR-CUSTOM-CONTENT-END]

export default [
  ...cinnabarPlugin.default.map((config) => ({
    ...config,
    files,
  })),
  {
    files,
    rules,
  },
  {
    ignores,
  },
];
