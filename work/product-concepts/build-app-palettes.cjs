const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const {derivePhotoPalette}=require('../load-domain.cjs')('lib/photoPalette.js');
const samples=JSON.parse(fs.readFileSync(path.join(__dirname,'palette-pixels.json'),'utf8'));
const photos={};
for(const [source,sample] of Object.entries(samples)) {
  const palette=derivePhotoPalette(sample.pixels,sample.config);
  photos[source]={hue:Math.round(palette.hue*10)/10,saturation:Math.round(palette.saturation*10)/10,
    width:sample.width,height:sample.height,region:sample.region,
    ...(sample.filename==='ice-latte-ea535cb71f.webp'?{cutout:'latte'}:{})};
}
fs.writeFileSync(path.join(root,'data/product-palettes.json'),JSON.stringify({version:1,photos},null,2)+'\n');
console.log(`Generated ${Object.keys(photos).length} palettes bound to exact source URL`);
