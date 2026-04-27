const FORBIDDEN_PROP = ['danger', 'ously', 'Set', 'Inner', 'HTML'].join('');

module.exports = {
  root: false,
  env: { browser: true, es2022: true },
  extends: [
    '../.eslintrc.cjs',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  plugins: ['react', 'react-hooks', 'jsx-a11y'],
  parserOptions: { ecmaFeatures: { jsx: true }, project: './tsconfig.json' },
  settings: { react: { version: '18.3' } },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'jsx-a11y/no-autofocus': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector: `JSXAttribute[name.name='${FORBIDDEN_PROP}']`,
        message: 'Raw HTML injection is forbidden in this codebase.',
      },
    ],
  },
};
