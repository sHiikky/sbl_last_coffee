const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict'),babel=require('@babel/core');
const root=path.resolve(__dirname,'..');
let filters=[];
const query={select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},then(resolve){return Promise.resolve({data:[{id:'available',name:'Coffee',price:100,is_available:true}]}).then(resolve);}};
function load(file,mocks={}){
 const code=babel.transformSync(fs.readFileSync(path.join(root,file),'utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,__DEV__:false,require:n=>(n.endsWith('/cartOptions')||n.endsWith('/cartOptions.js'))?require('./load-domain.cjs')('lib/cartOptions.js'):mocks[n]});return module.exports;
}
(async()=>{
 const catalog=load('lib/catalogService.js',{'./supabaseClient':{supabase:{from:()=>query}},'./menuLookup':{getMenuInfo:()=>null,findUnmatchedMenuItems:()=>[]}});
 const products=await catalog.fetchVisibleProducts();
 assert(filters.some(([k,v])=>k==='is_visible'&&v===true));
 assert(filters.some(([k,v])=>k==='is_available'&&v===true));
 assert.equal(products[0].isAvailable,true);
 const quote=load('lib/checkoutQuote.js');
 const cart=quote.refreshCartPrices({a:{id:'available',qty:2,unitPrice:90},b:{id:'stopped',qty:1,unitPrice:50}},products);
 assert.equal(cart.available.qty,2);assert.equal(cart.available.unitPrice,100);assert.equal(cart.b,undefined);
 const html=fs.readFileSync(path.join(root,'kassa-terminal/index.html'),'utf8');
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
 console.log('PASS: available-menu filter, stopped cart removal, quantities/prices, cashier JavaScript syntax');
})().catch(e=>{console.error(e);process.exitCode=1;});
