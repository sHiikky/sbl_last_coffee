const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const {derivePhotoPalette}=require('../load-domain.cjs')('lib/photoPalette.js');
const samples=JSON.parse(fs.readFileSync(path.join(__dirname,'palette-pixels.json'),'utf8'));
assert(Object.keys(samples).length,'No samples: current palettes were not changed');
const photos={};
for(const [source,sample] of Object.entries(samples)) {
  const palette=derivePhotoPalette(sample.pixels,sample.config);
  photos[source]={hue:Math.round(palette.hue*10)/10,saturation:Math.round(palette.saturation*10)/10,
    width:sample.width,height:sample.height,region:sample.region,
    ...(sample.filename==='ice-latte-ea535cb71f.webp'?{cutout:'latte'}:{})};
}
const target=path.join(root,'data/product-palettes.json');
if(process.argv.includes('--check')) {
  assert.deepEqual({version:1,photos},JSON.parse(fs.readFileSync(target,'utf8')));
  console.log(`PASS: relocated tools reproduce all ${Object.keys(photos).length} existing palettes`);
} else {
  fs.writeFileSync(target,JSON.stringify({version:1,photos},null,2)+'\n');
  console.log(`Generated ${Object.keys(photos).length} palettes bound to exact source URL`);
}
