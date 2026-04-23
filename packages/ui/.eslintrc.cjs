const path = require('path');
module.exports = {
  root: true,
  extends: [path.resolve(__dirname, '../config/eslint/base.cjs')],
  parserOptions: { ecmaFeatures: { jsx: true } },
  ignorePatterns: ['dist/', 'node_modules/'],
};
