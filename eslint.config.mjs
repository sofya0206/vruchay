import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/node_modules/**', '**/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Служебные скрипты запускаются напрямую в Node, вне сборки приложения.
    files: ['**/*.mjs', 'docs/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        /*
         * Часть таких скриптов передаёт функции в браузер через
         * page.evaluate — их тело выполняется на странице, а не в Node,
         * и обращается к document. Записано глобальным здесь, а не
         * заглушено комментарием на месте: подавленное правило перестало бы
         * ловить настоящие опечатки во всём остальном файле.
         */
        document: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
);
