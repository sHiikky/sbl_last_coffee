const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const admin=require('../../kassa-terminal/catalog-admin.js'),load=require('../load-domain.cjs');
const root=path.resolve(__dirname,'../..');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',M='33333333-3333-4333-8333-333333333333';
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};};
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.dataset={};this.attrs={};this.value='';this.checked=false;this.disabled=false;this.type='';this._text='';const set=new Set();this.classList={add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle(x,force){const on=force==null?!set.has(x):force;if(on)set.add(x);else set.delete(x);return on;}};}
 addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}
 async fire(name){for(const fn of this.listeners[name]||[])await fn({preventDefault(){},target:this});await flush();}
 appendChild(child){this.children.push(child);return child;}replaceChildren(...children){this.children=children;this._text='';}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 querySelector(){return this.option||(this.option=new Element('option'));}
 get childNodes(){return this.children;}get textContent(){return this._text+this.children.map(c=>c.textContent).join(' ');}set textContent(v){this._text=String(v);this.children=[];}
 get src(){return this.attrs.src;}set src(v){this.attrs.src=v;}
}
function harness(){
 const html=fs.readFileSync(path.join(root,'kassa-terminal/index.html'),'utf8');
 const roots=new Map([...html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)].map(m=>{const el=new Element(m[1]);el.type=m[0].match(/type="([^"]+)"/)?.[1]||'';return [m[2],el];}));
 const descendants=el=>[el,...el.children.flatMap(descendants)];
 const document={getElementById:id=>{assert(roots.has(id),id);return roots.get(id);},createElement:t=>new Element(t),querySelectorAll:s=>{
  const key=s==='[data-catalog-open]'?'catalogOpen':s==='[data-catalog-modifier]'?'catalogModifier':null;assert(key,s);return [...new Set([...roots.values()].flatMap(descendants))].filter(el=>el.dataset[key]);
 }};
 let active=true,session=1,uuid=0;const state={rows:[{id:M,name:'Сироп',price:30,is_modifier:true,is_available:true,catalog_version:1}],calls:[],plans:[],uploads:[],uploadPlans:[],confirm:true};
 const db={rpc:async(name,args)=>{state.calls.push({name,args});if(state.plans.length)return state.plans.shift().promise;if(name==='staff_list_catalog_products')return {data:{items:state.rows}};
  assert.equal(name,'staff_save_catalog_product');const row={id:args.p_id,catalog_version:args.p_expected_version+1,sbis_id:null,price:args.p_payload.price,manual_price:args.p_payload.price,
   ...args.p_payload,image_override_url:args.p_payload.image_url,app_content:args.p_payload};state.rows=[row,...state.rows.filter(r=>r.id!==row.id)];return {data:row};},
  auth:{getUser:async()=>({data:{user:{id:A}}})},storage:{from:bucket=>{assert.equal(bucket,'catalog-photos');return {upload:async(...args)=>{state.uploads.push(args);return state.uploadPlans.length?state.uploadPlans.shift().promise:{};},getPublicUrl:p=>({data:{publicUrl:'https://project.test/storage/v1/object/public/catalog-photos/'+p}})};}}};
 const controller=admin.create({document,getDb:()=>db,isActive:()=>active,getSession:()=>session,confirm:()=>state.confirm,crypto:{randomUUID:()=>`99999999-9999-4999-8999-${String(++uuid).padStart(12,'0')}`},preparePhoto:async file=>file});
 return {state,controller,el:id=>roots.get(id),document,logout(){active=false;session++;controller.reset();}};
}
const values={name:'Латте',menu_category:'Напитки',menu_subcategory:'Кофе',price:'350,50',price_mode:'manual',size_label:'300 мл',nutrition_basis:'portion',nutrition:{calories:'0',protein:'',fat:'4,5',carbs:''},sort_order:'0',is_available:true,image_url:'https://example.test/a.webp',allowed_modifier_ids:[M]};
(async()=>{
 const p=admin.payload(values,true);assert.equal(p.price,350.5);assert.deepEqual(p.nutrition,{calories:0,fat:4.5});assert.deepEqual(p.allowed_modifier_ids,[M]);assert.equal(admin.payload({...values,nutrition:null},true).nutrition,null);
 assert.equal(admin.payload({...values,description:null},false).description,null);
 for(const patch of [{price:''},{price:'-1'},{price:'1.123'},{image_url:''},{image_url:'javascript:alert(1)'},{image_url:'https://api.sbis.ru/img?x=1'},{allowed_modifier_ids:['bad-id']},{nutrition:{fat:'-1'}}])assert.throws(()=>admin.payload({...values,...patch},true));
 assert.equal(admin.payload({...values,image_url:'',is_modifier:true},true).is_visible,false);
 console.log('PASS: editor validates photos, decimal prices, exact UUID additions, nutrition zero/missing/inherited, draft and modifier publication');

 const cart=load('lib/cartOptions.js'),quote=load('lib/checkoutQuote.js');
 const product={id:B,name:'Латте',price:100,allowedModifierIds:[M]};
 assert(cart.makeCartItem(product,[{id:M,quantity:1,unitPrice:30}],1));assert.equal(cart.makeCartItem({...product,allowedModifierIds:[]},[{id:M,quantity:1,unitPrice:30}],1),null);
 const line=cart.makeCartItem(product,[{id:M,quantity:1,unitPrice:30}],1);
 assert.equal(Object.keys(quote.refreshCartPrices({[line.key]:line},[{...product,allowedModifierIds:[]},{id:M,isModifier:true,price:30}])).length,0,'refresh drops whole forbidden recipe, never silently removes its addition');
 const row={id:B,name:'Old SBIS name',price:350.5,menu_category:'Напитки',menu_subcategory:'Кофе',is_available:true,image_override_url:'https://example.test/a.webp',allowed_modifier_ids:[M],app_content:{...p,name:'Новое имя',description:'Описание',ingredients:'Кофе',allergens:'Молоко',size_label:'400 мл'}};
 const lookup={getMenuInfo:()=>({nutrition:{calories:999},description:'Legacy description',calculated:true})};
 const catalog=load('lib/catalogService.js',{'./supabaseClient':{supabase:{rpc:async()=>({data:[row]})}},'./menuLookup':lookup});
 let [mapped]=await catalog.fetchOrderingCatalog();assert.equal(mapped.displayName,'Новое имя');assert.equal(mapped.sizeLabel,'400 мл');assert.equal(mapped.description,'Описание');assert.equal(mapped.nutrition.calories,0);assert.equal(mapped.nutritionCalculated,false);assert.equal(mapped.ingredients,'Кофе');assert.equal(mapped.allowedModifierIds[0],M);
 row.app_content.nutrition=null;row.app_content.description=null;[mapped]=await catalog.fetchOrderingCatalog();assert.equal(mapped.nutrition.calories,999);assert.equal(mapped.description,'Legacy description');
 console.log('PASS: actual catalog reads curated data ahead of old menu; inheritance preserved; allowed additions enforced in cart and price refresh');

 const h=harness();await h.el('catalogBtn').fire('click');assert(h.controller.isOpen());assert.equal(h.el('catalogPublish').disabled,false);
 h.el('catalogName').value='<img src=x onerror=alert(1)>';h.el('catalogPrice').value='350';await h.el('catalogName').fire('input');
 assert.equal(await h.controller.save(true),false);assert.equal(h.state.calls.length,1,'no save without photo');
 h.el('catalogImage').value='https://example.test/a.webp';h.el('catalogAllAdditions').checked=true;
 assert.equal(await h.controller.save(true),true);const first=h.state.calls.find(c=>c.name==='staff_save_catalog_product');assert.equal(first.args.p_expected_version,0);assert.equal(first.args.p_payload.allowed_modifier_ids,null);
 assert.equal(h.el('catalogRows').children[0].children.at(-1).children[0].textContent,'<img src=x onerror=alert(1)>','title is text, never HTML');
 console.log('PASS: actual editor draft/create/publish uses stable UUID, validated RPC and literal preview/list text');

 const pending=deferred();h.state.plans.push(pending);h.el('catalogName').value='Keep my edit';await h.el('catalogName').fire('input');
 const save=h.controller.save(true);await flush();assert.equal(await h.controller.save(true),false,'double save blocked');pending.resolve({error:{message:'CATALOG_CONFLICT'}});assert.equal(await save,false);assert.equal(h.el('catalogName').value,'Keep my edit');assert.match(h.el('catalogStatus').textContent,/другим сотрудником/);
 const late=deferred();h.state.plans.push(late);const lateSave=h.controller.save(true);await flush();h.logout();late.resolve({data:{id:first.args.p_id,catalog_version:3,name:'OLD STAFF DATA'}});await lateSave;
 assert.equal(h.el('catalogName').value,'');assert.equal(h.controller.isOpen(),false);assert(!h.el('catalogStatus').textContent.includes('OLD STAFF'));
 console.log('PASS: conflicts preserve form, duplicate saves blocked, logout invalidates late catalog responses');

 const photo=harness();await photo.el('catalogBtn').fire('click');assert(await photo.controller.upload({type:'image/webp',size:123}));assert.equal(photo.state.uploads[0][2].upsert,false);assert(photo.state.uploads[0][0].startsWith(A+'/'));assert.match(photo.el('catalogImage').value,/\/catalog-photos\//);assert.match(photo.el('catalogDirty').textContent,/несохранённые/);
 const upload=deferred();photo.state.uploadPlans.push(upload);const lateUpload=photo.controller.upload({type:'image/png',size:80});await flush();photo.logout();upload.resolve({});await lateUpload;assert.equal(photo.el('catalogImage').value,'');
 console.log('PASS: photos use immutable per-user/product keys; binding requires save; late upload cannot contaminate another session');
})().catch(e=>{console.error(e);process.exitCode=1;});
