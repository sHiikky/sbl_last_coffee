const assert = require('node:assert/strict');
const load = require('./load-domain.cjs');
const empty = require('../data/photo-compositions.json');
const cleanedPhotos = load('lib/productPhotoSource.js', { '../assets/product-cutouts/breakfast.png': 101, '../assets/product-cutouts/orange-punch.png': 102 }, { URL });
const { getPhotoComposition, validPhotoFrame, photoTranslation, fitProductPhoto } = load('lib/photoComposition.js', { '../data/photo-compositions.json': empty });
const product = { id: 'coffee-1', image: { uri: 'https://example.com/latte.png' } };
const detail = { fit: 'contain', zoom: 0.8, offsetX: 10, offsetY: -20 };
const card = { fit: 'cover', zoom: 1.2, offsetX: -5, offsetY: 0 };
const manifest = { ...empty, products: [{ id: product.id, sourceUrl: product.image.uri, detail, card }] };
assert.equal(getPhotoComposition(product).zoom, 0.9, 'tall detail image has breathing room by default');
assert.equal(getPhotoComposition(product, 'card').zoom, 1, 'existing menu composition stays unchanged');
assert.equal(JSON.stringify(getPhotoComposition(product, 'detail', manifest)), JSON.stringify(detail));
assert.equal(JSON.stringify(getPhotoComposition(product, 'card', manifest)), JSON.stringify(card));
assert.equal(getPhotoComposition({ ...product, image: { uri: 'https://example.com/new.png' } }, 'detail', manifest).zoom, 0.9, 'replaced image invalidates old composition');
assert.equal(getPhotoComposition({ ...product, id: 'other' }, 'detail', manifest).zoom, 0.9, 'settings never match by a similar name');
assert.equal(getPhotoComposition(product, 'detail', { ...manifest, version: 2 }).zoom, 0.9);
assert.equal(getPhotoComposition(product, 'detail', { ...manifest, projectRef: 'other-project' }).zoom, 0.9);
assert.equal(getPhotoComposition(product, 'detail', { ...manifest, products: [...manifest.products, ...manifest.products] }).zoom, 0.9, 'ambiguous IDs are rejected');
for (const bad of [null, { ...detail, zoom: NaN }, { ...detail, zoom: 0 }, { ...detail, offsetX: 36 }, { ...detail, offsetY: -36 }, { ...detail, fit: 'fill' }]) {
  assert.equal(validPhotoFrame(bad), false);
  assert.equal(getPhotoComposition(product, 'detail', { ...manifest, products: [{ ...manifest.products[0], detail: bad }] }).zoom, 0.9);
}
assert.equal(JSON.stringify(photoTranslation(detail, { width: 400, height: 420 })), JSON.stringify({ x: 40, y: -84 }), 'offsets use frame dimensions and are not multiplied by zoom');
assert.equal(JSON.stringify(photoTranslation(detail, null)), JSON.stringify({ x: 0, y: 0 }));
// Exercise the real image component's load/error callbacks across source changes.
// A failed old image must not permanently hide a new photo or win an A -> B -> A race.
const babel = require('@babel/core'), fs = require('node:fs'), vm = require('node:vm');
let slots = [], cursor = 0, effects = [], dirty = false;
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  Fragment: 'Fragment',
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (next !== slots[i]) { slots[i] = next; dirty = true; } }]; },
  useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((dep, j) => dep !== slots[i][j])) { slots[i] = deps; effects.push(fn); } },
};
const native = { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', StyleSheet: require('./load-installed-stylesheet.cjs')() };
const mocks = { react: React, 'react-native': native, 'expo-image': { Image: 'ExpoImage' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' }, '@expo/vector-icons': { Ionicons: 'Icon' }, '../theme/tokens': { colors: {} }, './HolographicSurface': { default: 'HolographicSurface' }, './BrandLogo': { default: 'BrandLogo' }, '../lib/photoComposition': { photoTranslation } };
const imageModule = { exports: {} };
mocks['../lib/productPhotoSource'] = cleanedPhotos;
const imageCode = babel.transformSync(fs.readFileSync('components/ProductImage.js', 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code;
vm.runInNewContext(imageCode, { module: imageModule, exports: imageModule.exports, require: name => { if (/(?:^|\/)AppText(?:Input)?$/.test(name)) return name.endsWith('Input') ? 'TextInput' : 'Text'; if (!(name in mocks)) throw new Error(`Unexpected image dependency ${name}`); return mocks[name]; } });
function render(source) {
  let tree;
  for (let i = 0; i < 5; i++) { cursor = 0; effects = []; dirty = false; tree = imageModule.exports.default({ source: { uri: source } }); effects.forEach(effect => effect()); if (!dirty) return tree; }
  throw new Error('Image render did not settle');
}
function findImage(tree) { if (tree?.type === 'ExpoImage') return tree; for (const child of tree?.props?.children?.flat(Infinity) || []) { if (child && typeof child === 'object') { const found = findImage(child); if (found) return found; } } return null; }
const oldA = findImage(render('https://example.com/a.png'));
oldA.props.onError();
assert.equal(findImage(render('https://example.com/a.png')), null, 'failed source shows placeholder');
assert.ok(findImage(render('https://example.com/b.png')), 'a different source recovers from an earlier failure');
const newA = findImage(render('https://example.com/a.png'));
oldA.props.onError();
assert.ok(findImage(render('https://example.com/a.png')), 'late original A callback cannot fail the new A request');
newA.props.onError();
assert.equal(findImage(render('https://example.com/a.png')), null, 'current request errors still show a fallback');
console.log('PASS: product photo defaults, separate views, URL/UUID binding, invalid imports and frame translation');
console.log('PASS: real image source recovery and late A/B/A error protection');
assert.equal(cleanedPhotos.productPhotoSource({uri:'https://31.31.207.216/coffee/storage/v1/object/public/product-photos/breakfast-constructor-7736456714.webp'}),101);
for(const uri of ['https://untrusted.example/storage/v1/object/public/product-photos/breakfast-constructor-7736456714.webp','https://31.31.207.216/coffee/storage/v1/object/public/product-photos/breakfast-new.webp'])assert.equal(cleanedPhotos.productPhotoSource(uri),uri);

// Actual catalog aspect ratios plus an extra-wide photo. Every edge must stay
// inside the viewport, even for editor zoom1.8/offset35 and a short phone frame.
for(const [sw,sh] of [[580,900],[599,900],[400,900],[733,900],[900,899],[1600,400]])
for(const [width,height] of [[240,176],[240,88],[100,120]])
for(const zoom of [.5,.9,1,1.8])
for(const offset of [-35,0,35]) {
  const fit=fitProductPhoto({width:sw,height:sh},{width,height},{zoom,offsetX:offset,offsetY:offset});
  assert(Math.abs(fit.width/fit.height-sw/sh)<1e-9,'source aspect ratio is preserved');
  assert(Math.abs(fit.x)+fit.width/2<=width/2+1e-8,'left/right image edges remain inside frame');
  assert(Math.abs(fit.y)+fit.height/2<=height/2+1e-8,'top/bottom image edges remain inside frame');
}
// Render the real photo wrapper, including unknown sizes, late callbacks and
// bundled assets. No SVG mask, blur, fade or second zoom is allowed here.
let photoSlots=[],photoCursor=0;
const requests=[];
const photoReact={createElement:React.createElement,
  useState(initial){const i=photoCursor++;if(!(i in photoSlots))photoSlots[i]=initial;return[photoSlots[i],v=>{photoSlots[i]=v;}];},
  useEffect(fn,deps){const i=photoCursor++,old=photoSlots[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){old?.cleanup?.();photoSlots[i]={deps,cleanup:fn()};}}
};
const photoMocks={react:photoReact,'react-native':{View:'View',Image:{getSize:(uri,ok,fail)=>requests.push({uri,ok,fail}),resolveAssetSource:()=>({width:900,height:899})}},'./ProductImage':'ProductImage','../lib/photoComposition':{fitProductPhoto}};
const photoModule={exports:{}};
const photoCode=babel.transformSync(fs.readFileSync('components/SoftEdgeProductPhoto.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code;
vm.runInNewContext(photoCode,{module:photoModule,exports:photoModule.exports,require:name=>{assert(name in photoMocks,`Unexpected photo dependency ${name}`);return photoMocks[name];}});
const renderPhoto=(source)=>{photoCursor=0;return photoModule.exports.default({product:{image:source,name:'Напиток'},frame:{fit:'cover',zoom:1.8,offsetX:35,offsetY:35},width:120,height:88});};
const checkPhoto=tree=>{
  const wrapper=tree.props.children[0],image=wrapper.props.children[0];
  assert.equal(image.type,'ProductImage');assert.equal(image.props.contentFit,'contain');assert.equal(image.props.zoom,1);
  assert.equal(wrapper.props.style.opacity,undefined);assert.equal(wrapper.props.style.filter,undefined);
  assert(wrapper.props.style.width<=120&&wrapper.props.style.height<=88);
  return wrapper.props.style;
};
checkPhoto(renderPhoto('https://example.com/a.png'));
const requestA=requests.at(-1);requestA.ok(580,900);
assert(Math.abs(checkPhoto(renderPhoto('https://example.com/a.png')).width/88-580/900)<1e-9);
checkPhoto(renderPhoto('https://example.com/b.png'));requestA.ok(900,100);
assert.equal(checkPhoto(renderPhoto('https://example.com/b.png')).width,120,'old source dimensions cannot size a new source');
requests.at(-1).ok(400,900);checkPhoto(renderPhoto('https://example.com/b.png'));
renderPhoto(101);const bundled=checkPhoto(renderPhoto(101));assert(Math.abs(bundled.width/bundled.height-900/899)<1e-9);
// The one reviewed latte polygon also uses the bounded fit, rather than an
// independent height-only scale. It has no gradient transparency mask.
const latteModule={exports:{}};
const latteMocks={react:{...photoReact,useId:()=> 'photo1'},'react-native':{View:'View'},'react-native-svg':{default:'Svg',Defs:'Defs',ClipPath:'ClipPath',Polygon:'Polygon',Image:'SvgImage'},'./SoftEdgeProductPhoto':'SoftEdgeProductPhoto','../lib/photoComposition':{fitProductPhoto},'../lib/productPhotoSource':cleanedPhotos};
const latteCode=babel.transformSync(fs.readFileSync('components/ProductSheetPhoto.js','utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code;
vm.runInNewContext(latteCode,{module:latteModule,exports:latteModule.exports,require:name=>{assert(name in latteMocks,`Unexpected latte dependency ${name}`);return latteMocks[name];}});
photoSlots=[];photoCursor=0;
const latteTree=latteModule.exports.default({product:{image:'https://example.com/latte.png'},visual:{cutout:'latte',source:'https://example.com/latte.png'},frame:{fit:'contain',zoom:1.8,offsetX:35,offsetY:35},width:60,height:176});
const latteWrapper=latteTree.props.children[1],latteSvg=latteWrapper.props.children[0];
assert.equal(latteSvg.props.width,60);assert.equal(latteSvg.props.height,135);
assert(Math.abs(latteWrapper.props.style.transform[1].translateY)+latteSvg.props.height/2<=88);
console.log('PASS: 216 whole-photo bounds cases; real unmasked wrapper, late sizes, bundled images and bounded reviewed latte cutout');
