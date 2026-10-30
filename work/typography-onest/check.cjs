const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');
const families = Object.fromEntries([400,500,600,700,800,900].map(w => [w, `SBLOnest${w}`]));
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const native = {
  StyleSheet: { flatten },
  Text: React.forwardRef(({ style, ...props }, ref) => React.createElement('span', { ...props, ref, style: flatten(style) })),
  TextInput: React.forwardRef(({ style, ...props }, ref) => React.createElement('input', { ...props, ref, style: flatten(style) })),
};
function load(file, extra = {}) {
  const code = babel.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports:{} };
  const mocks = { react:React, 'react-native':native, '../theme/fontFaces':{fontFamilies:families}, ...extra };
  vm.runInNewContext(code, { module,exports:module.exports,require:name=>{assert(name in mocks, name);return mocks[name];} });
  return module.exports;
}
const text = load('components/AppText.js'), Text = text.default;
const Input = load('components/AppTextInput.js', { './AppText':text }).default;
const e = React.createElement;
const html = renderToStaticMarkup(e(text.FontReadyContext.Provider, {value:true},
  e(Text,{style:[{fontWeight:'700'},{color:'#202320'}]}, 'Сумма ',e(Text,null,'280 ₽')),
  e(Text,{style:{fontWeight:'600',fontVariant:['tabular-nums']}},'360 ₽'),
  e(Input,{value:'+7 (999)-123-45-67',readOnly:true,'aria-label':'Телефон'})));
assert.equal((html.match(/font-family:SBLOnest700/g)||[]).length,2,'nested text inherits the actual weight');
assert(html.includes('font-family:SBLOnest600'),'price selects the actual semibold file');
assert(html.includes('font-family:SBLOnest400'),'input uses the chosen body font');
assert(html.includes('font-weight:normal'),'no synthetic bold over an already weighted face');
assert(html.includes('aria-label="Телефон"'),'input accessibility and value survive the wrapper');
const fallback = renderToStaticMarkup(e(Text,{style:{fontWeight:'700'}},'Без шрифта'));
assert(!fallback.includes('SBLOnest'),'loading failure can display system text');
assert(fallback.includes('font-weight:700'));
const manifest = JSON.parse(fs.readFileSync(path.join(root,'assets/fonts/onest/SOURCE.json'),'utf8'));
for(const face of manifest.faces) assert(fs.statSync(path.join(root,'assets/fonts/onest',face.file)).size>10000);
assert.equal(manifest.faces.length,6);
console.log('PASS: actual typography wrappers render loaded body/price faces, inherit nested weight, preserve inputs and gracefully fall back; all six bundled assets present');
