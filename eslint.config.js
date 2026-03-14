import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.es2022,
                ...globals.node,
            },
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        rules: {
            'indent': ['error', 4],
            'linebreak-style': ['error', 'unix'],
            'max-len': [2, 120],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'space-in-parens': ['error', 'never'],
            'keyword-spacing': ['error', { before: true, after: true }],
        },
    },
);
