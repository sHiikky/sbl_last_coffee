const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict'),babel=require('@babel/core');
const code=babel.transformSync(fs.readFileSync(path.resolve(__dirname,'../hooks/useOrderStatus.js'),'utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
let active,plan=null;const channels=[],timers=new Set();
const React={
 useState(initial){const h=active,i=h.cursor++;if(!h.slots[i])h.slots[i]={value:typeof initial==='function'?initial():initial};return[h.slots[i].value,value=>{h.slots[i].value=typeof value==='function'?value(h.slots[i].value):value;}];},
 useRef(initial){const h=active,i=h.cursor++;if(!h.slots[i])h.slots[i]={value:{current:initial}};return h.slots[i].value;},
 useEffect(callback,deps){const h=active,i=h.cursor++,old=h.slots[i];if(!old||!deps.every((v,n)=>Object.is(v,old.deps[n])))h.effects.push(()=>{old?.cleanup?.();h.slots[i]={deps,cleanup:callback()};});},
};
const supabase={from(){return{select(){return this;},eq(){return this;},async single(){if(plan){const p=plan;plan=null;return p;}return{data:{status:'new',order_number:42}};}};},channel(name){const ch={name,on(_event,_filter,cb){this.cb=cb;return this;},subscribe(cb){this.status=cb;return this;}};channels.push(ch);return ch;},removeChannel(ch){ch.removed=true;}};
const AppState={currentState:'active',addEventListener(_event,cb){return{remove(){}};}};
const modules={react:React,'react-native':{AppState},'../lib/supabaseClient':{supabase}};
const mod={exports:{}};vm.runInNewContext(code,{module:mod,exports:mod.exports,require:n=>modules[n],setInterval(cb){timers.add(cb);return cb;},clearInterval(cb){timers.delete(cb);}});
function harness(id){const h={slots:[],cursor:0,effects:[],id,finished:0};h.render=()=>{active=h;h.cursor=0;h.effects=[];h.result=mod.exports.default(h.id,{initialStatus:'new',onFinished:()=>h.finished++});h.effects.forEach(fn=>fn());return h.result;};h.stop=()=>h.slots.forEach(s=>s.cleanup?.());return h;}
(async()=>{
 let resolveSlow;plan=new Promise(resolve=>{resolveSlow=resolve;});
 const a=harness('one');a.render();const b=harness('one');b.render();await flush();
 assert.equal(channels.length,2);assert.notEqual(channels[0].name,channels[1].name);
 channels[0].cb({new:{status:'ready',order_number:42}});
 resolveSlow({data:{status:'new',order_number:42}});await flush();assert.equal(a.render().status,'ready');
 channels[0].cb({new:{status:'completed',order_number:42}});assert.equal(a.render().status,'completed');assert.equal(a.finished,1);
 [...timers][0]();await flush();assert.equal(a.render().status,'completed');assert.equal(a.finished,1);
 a.id='two';assert.equal(a.render().status,'new');await flush();assert.equal(a.render().orderId,'two');assert(channels[0].removed);
 a.stop();b.stop();assert.equal(timers.size,0);assert(channels.every(ch=>ch.removed));
 plan=Promise.resolve({data:{status:'preparing',order_number:43,total:100,bonus_redeemed:20,pickup_at:'2026-10-29T05:00:00Z'}});
 const c=harness('three');c.render();await flush();
 assert.equal(c.render().details.total,100);assert.equal(c.render().details.bonus_redeemed,20);assert.equal(c.render().refreshing,false);
 assert.equal(typeof c.render().lastUpdatedAt,'number');
 plan=Promise.resolve({error:new Error('offline')});await c.render().refresh();await flush();
 assert.equal(c.render().error.message,'offline');assert.equal(c.render().status,'preparing');assert.equal(c.render().details.total,100);assert.equal(c.render().refreshing,false);
 plan=Promise.resolve({data:{status:'ready',order_number:43,total:100,bonus_redeemed:20}});await c.render().refresh();await flush();
 assert.equal(c.render().error,null);assert.equal(c.render().status,'ready');
 plan=Promise.resolve({error:new Error('channel offline')});channels.at(-1).status('CHANNEL_ERROR');await flush();
 assert.equal(c.render().error.message,'channel offline');assert.equal(c.render().status,'ready');
 c.stop();assert.equal(timers.size,0);assert(channels.every(ch=>ch.removed));
 console.log('PASS: unique channels for the same order, late GET cannot overwrite realtime, terminal status cannot reopen, new order resets state, channels/timers are cleaned');
 console.log('PASS: server order details, explicit retry, preserved offline status, recovered errors and channel failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
