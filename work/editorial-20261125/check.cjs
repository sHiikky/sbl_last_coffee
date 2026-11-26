const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),babel=require('@babel/core');
const root=path.resolve(__dirname,'../..');
const load=require('../load-domain.cjs');
const badges=require('../../kassa-terminal/product-badge');
const content=require('../../kassa-terminal/content-admin');
for(const style of badges.styles){
 const encoded=badges.encode('НОВИНКА',style);
 assert.deepEqual(badges.parse(encoded),{text:'НОВИНКА',style});
 assert.ok(encoded.length<=32);
}
assert.equal(badges.encode('','silver'),'');
assert.equal(badges.parse('hit').text,'ХИТ');
assert.equal(badges.parse('new').style,'black');
assert.equal(badges.parse('Своя метка').text,'Своя метка');
assert.throws(()=>badges.encode('x'.repeat(21),'orange'));
assert.throws(()=>badges.encode('x','javascript'));
assert.throws(()=>badges.encode('a\nb','black'));
const id='11111111-1111-4111-8111-111111111111';
assert.throws(()=>content.makePayload({kind:'announcement',title:'Новое',body:'Пробуйте'},'published'));
const payload=content.makePayload({kind:'announcement',title:'Новое',body:'Пробуйте',products:[id,id]},'published');
assert.deepEqual(payload.product_ids,[id]);
assert.throws(()=>content.makePayload({...payload,products:['invalid']},'published'));

let handler,providerCalls=0,insertions=0,registered=false,quota=false,updates=[];
const environment={SMSC_API_KEY:'synthetic'};
const db={rpc:async()=>({data:registered}),from:()=>{
 let inserting=false,updating=false;
 const chain={select(){return chain},eq(){return chain},neq(){return chain},gte(){return chain},order(){return chain},limit(){return chain},
  insert(){inserting=true;insertions++;return chain},update(v){updating=true;updates.push(v);return chain},
  single:async()=>({data:{id}}),then(resolve){resolve(updating?{}:{data:quota?Array.from({length:5},()=>({created_at:'2000-01-01'})):[],count:quota?5:0})}};
 return chain;
}};
const source=fs.readFileSync(path.join(root,'supabase/functions/start-waitcall/index.ts'),'utf8');
const compiled=babel.transformSync(source,{filename:'index.ts',babelrc:false,configFile:false,
 presets:[['@babel/preset-typescript',{allowDeclareFields:true}]],plugins:['@babel/plugin-transform-modules-commonjs']}).code;
vm.runInNewContext(compiled,{exports:{},require:()=>({admin:()=>db,callerUser:async()=>({id}),cors:{},json:(body,status=200)=>Response.json(body,{status})}),
 Deno:{env:{get:key=>environment[key]},serve:fn=>handler=fn},
 Response,Date,console,URLSearchParams,AbortSignal,fetch:async()=>{providerCalls++;return Response.json({phone:'79000000000'})}});
async function request(intent){return handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({phone:'+79000000001',intent})}));}
(async()=>{
 let response=await request('login');assert.equal(response.status,404);assert.equal((await response.json()).code,'PHONE_NOT_REGISTERED');
 assert.equal(providerCalls,0);assert.ok(updates.some(v=>v.consumed&&v.last_error==='LOGIN_NOT_REGISTERED'));
 registered=true;response=await request('login');assert.equal(response.status,200);assert.equal((await response.json()).loginAccountExists,true);assert.equal(providerCalls,1);
 registered=false;response=await request('register');assert.equal(response.status,200);assert.equal(providerCalls,2);
 quota=true;response=await request('login');assert.equal(response.status,429);assert.equal(providerCalls,2);
 quota=false;environment.REVIEW_DEMO_PHONE='+79000000001';
 registered=true;response=await request('login');assert.equal(response.status,200);assert.equal((await response.json()).loginAccountExists,true);assert.equal(providerCalls,2);
 registered=false;response=await request('login');assert.equal(response.status,404);assert.equal(providerCalls,2);
 response=await request('register');assert.equal(response.status,200);assert.equal(providerCalls,2);
 const client={auth:{getUser:async()=>({data:{user:{id,is_anonymous:true}}}),updateUser:async()=>{throw Error('MUST_NOT_UPDATE_PHONE')}},functions:{invoke:async()=>({error:{context:{status:404,json:async()=>({code:'PHONE_NOT_REGISTERED',error:'Номер не зарегистрирован'})}}})}};
 const account=load('lib/accountService.js',{'./supabaseClient':{supabase:{},ensureAnonymousSession:async()=>{}},'./notificationService':{unregisterCurrentPushToken:async()=>{}}});
 const service=account.createAccountService({client,ensureSession:async()=>{},enabled:true});
 await assert.rejects(service.startWaitCallSignIn('+79000000001',{intent:'login'}),e=>e.code==='PHONE_NOT_REGISTERED');
 console.log('PASS: badge round-trips/legacy/removal/validation; announcement selection; unknown login makes no provider request, known login/register and quotas; client preserves typed registration redirect');
})().catch(e=>{console.error(e);process.exitCode=1});
