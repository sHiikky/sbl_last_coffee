const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
module.exports = function loadDomain(file, mocks = {}, globals = {}) {
  const absolute = path.resolve(root, file);
  const code = babel.transformSync(fs.readFileSync(absolute, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console, process: { env: {} }, Date, Intl, ...globals, require: name => { if (/(?:^|\/)AppText(?:Input)?$/.test(name)) return name.endsWith('Input') ? 'TextInput' : 'Text';
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('.')) {
      const resolved = path.resolve(path.dirname(absolute), name + (path.extname(name) ? '' : '.js'));
      if (!resolved.startsWith(root + path.sep)) throw new Error('Test module outside project');
      return loadDomain(path.relative(root, resolved), mocks, globals);
    }
    throw new Error(`Unexpected test dependency: ${name}`);
  } });
  return module.exports;
};
