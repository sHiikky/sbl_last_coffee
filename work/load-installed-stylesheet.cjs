// Use the installed RN export surface, rather than inventing removed APIs in mocks.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), babel = require('@babel/core');
module.exports = function loadInstalledStyleSheet() {
  const file = path.join(path.dirname(require.resolve('react-native/package.json')), 'Libraries/StyleSheet/StyleSheetExports.js');
  // Babel's Flow stripper predates Flow's `out` variance annotation. Remove
  // only this type annotation; the installed runtime export object is unchanged.
  const source = fs.readFileSync(file, 'utf8').replace('create<out S extends', 'create<S extends');
  const code = babel.transformSync(source, {
    babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-flow-strip-types', '@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, __DEV__: false,
    require(name) {
      if (name.endsWith('composeStyles')) return (a,b) => a && b ? [a,b] : a || b;
      if (name.endsWith('ReactNativeStyleAttributes')) return {};
      if (name.endsWith('flattenStyle')) return value => Array.isArray(value) ? Object.assign({}, ...value.flat(Infinity)) : value;
      if (name.endsWith('PixelRatio')) return { __esModule: true, default: { roundToNearestPixel: n => n, get: () => 2 } };
      throw new Error('Unexpected StyleSheet dependency: ' + name);
    }, console,
  }, { filename: file });
  return module.exports.default;
};
