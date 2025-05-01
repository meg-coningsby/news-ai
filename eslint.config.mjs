import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // To disable the rule
      // Or to configure it as a warning:
      // "@typescript-eslint/no-explicit-any": "warn",
      // Or to configure it with specific options (if available for this rule):
      // "@typescript-eslint/no-explicit-any": ["error", { ignoreRestArgs: true }],
    },
  },
];

export default eslintConfig;
