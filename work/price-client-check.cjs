const assert=require('node:assert/strict');
const fs=require('fs'),vm=require('vm'),babel=require('@babel/core');
const path=require('path');
const storage=new Map(); let lastPayload;
const supabase={ rpc: async (_name,payload)=>{ lastPayload=payload; return {data:[{id:'order',total:90}]}; } };
const mocks={
 'expo-crypto':{randomUUID:()=> 'uuid'},
 '@react-native-async-storage/async-storage':{__esModule:true,default:{
  getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k),
 }}, './supabaseClient':{supabase},
};
function load(file,mocks={}) {
 const source=babel.transformSync(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),{
  babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs'],
 }).code;
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,require:n=>{if(n.endsWith('/cartOptions')||n.endsWith('/cartOptions.js'))return require('./load-domain.cjs')('lib/cartOptions.js');if(!mocks[n])throw Error(n);return mocks[n]},console});
 return module.exports;
}
const {buildCheckoutQuote,money,refreshCartPrices}=load('lib/checkoutQuote.js');
const service=load('lib/orderService.js',mocks);
(async()=>{
 const items=[{id:'b',qty:1,unitPrice:19.95},{id:'a',qty:2,unitPrice:25},{id:'b',qty:2,unitPrice:19.95}];
 const quote=buildCheckoutQuote(items,109.85);
 assert.equal(JSON.stringify(quote.items),JSON.stringify([['a','a',2,25,[]],['b','b',3,19.95,[]]]));
 assert.equal(money(19.95*2*.1),3.99);
 assert.throws(()=>buildCheckoutQuote([{id:'a',qty:1,unitPrice:NaN}],10));
 const original={k:{id:'a',qty:2,unitPrice:25},gone:{id:'gone',qty:1,unitPrice:1}};
 const refreshed=refreshCartPrices(original,[{id:'a',price:30,name:'new',menuCategory:'test'}]);
 assert.equal(refreshed.a.unitPrice,30);assert.equal(refreshed.a.qty,2);assert.equal(refreshed.gone,undefined);
 assert.equal(original.k.unitPrice,25);
 const attempt={idempotencyKey:'key',items,promoCode:null,rewardRequested:false,bonusRedeem:0,expectedQuote:quote};
 await service.savePendingCheckoutAttempt(attempt);
 const pending=await service.getPendingCheckoutAttempt();
 assert.equal(JSON.stringify(pending.payload.expectedQuote),JSON.stringify(quote));
 assert.equal(pending.fingerprint,service.buildRequestFingerprint(attempt));
 const different={...attempt,expectedQuote:{...quote,payable:110}};
 assert.notEqual(service.buildRequestFingerprint(attempt),service.buildRequestFingerprint(different));
 await service.createOrder(attempt);
 assert.equal(JSON.stringify(lastPayload.p_quote),JSON.stringify(quote));
 assert.equal(service.classifyOrderError({message:'PRICE_CHANGED: updated'}).type,'deterministic');
 assert.equal(service.classifyOrderError({message:'network timeout'}).type,'unknown');
 console.log('PASS: quote aggregation, cents, invalid prices, cart refresh, persistent quote/fingerprint, RPC payload, deterministic price errors and uncertain network errors');
})().catch(e=>{console.error(e);process.exitCode=1});
