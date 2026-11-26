const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),os=require('node:os');
const {chromium}=require(require.resolve('playwright',{paths:[path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')]}));
const app=path.resolve(__dirname,'../..'),workspace=path.dirname(app),web=process.env.SBL_TEST_EXPORT||path.join(workspace,'migration-stage-a-20261108/trial-runtime/editorial-20261125/export');
const id='11111111-1111-4111-8111-111111111111',uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const image='https://example.test/photo.svg';
const products=['orange','holo','silver','black'].map((style,i)=>({id:id.slice(0,-1)+(i+1),name:['Латте','Матча','Какао','Раф'][i],price:250,image_url:image,menu_category:'Напитки',menu_subcategory:'Кофе',is_visible:true,is_available:true,is_modifier:false,badge:style+':'+['ХИТ','NEW','СЕЗОН','SBL'][i]}));
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),base=name.startsWith('/admin/')?path.join(app,'kassa-terminal'):web;
 const rel=name.startsWith('/admin/')?name.slice(7):name.slice(1),file=path.resolve(base,rel||'index.html');
 if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return}
 try{const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml'})[ext]||'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});let errors=[],loginRequests=[];
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===origin)return route.continue();
  if(u.hostname==='example.test')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#b74924"/></svg>'});
  if(u.hostname==='31.31.207.216'){
   if(route.request().method()==='OPTIONS')return json(route,{});
   if(u.pathname.endsWith('/functions/v1/start-waitcall')){
    loginRequests.push(route.request().postDataJSON());
    return json(route,{code:'PHONE_NOT_REGISTERED',error:'Этот номер ещё не зарегистрирован. Создайте аккаунт.'},404);
   }
   if(u.pathname.includes('/products'))return json(route,products);
   if(u.pathname.includes('get_app_publications'))return json(route,{server_now:new Date().toISOString(),items:[{id:uid,kind:'announcement',title:'Попробуйте новое',body:'Четыре вкуса для вашего дня',product_ids:products.map(p=>p.id),starts_at:'2026-01-01T00:00:00Z'}]});
   if(u.pathname.includes('/orders')||u.pathname.includes('/staff'))return json(route,[]);
   if(u.pathname.includes('/bonus_accounts'))return json(route,{balance:0,lifetime_paid:0});
   if(u.pathname.includes('/get_loyalty_state'))return json(route,{customerId:uid,rewards:[],visitedDays:[],today:'2026-11-25',currentStreak:0,longestStreak:0});
   if(u.pathname.includes('/auth/')){const user={id:uid,is_anonymous:true,aud:'authenticated',user_metadata:{},app_metadata:{}};const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.fake';return json(route,u.pathname.endsWith('/user')?user:{access_token:token,refresh_token:'synthetic',expires_in:3600,token_type:'bearer',user});}
   return json(route,{code:'PGRST202',message:'Synthetic missing optional RPC'},404);
  }
  if(u.hostname.includes('jsdelivr'))return route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};'});
  return route.abort();
 });
 if(process.env.SBL_TEST_LAUNCH){
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(origin);
  const intro=page.getByTestId('brand-launch');await intro.waitFor({timeout:30000});
  assert.equal(await intro.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  await intro.locator('svg ellipse').first().waitFor({state:'attached'});
  await page.screenshot({path:path.join(app,'work/photo-tools/launch-initial-390.png')});
  await intro.waitFor({state:'detached',timeout:15000});
  await page.getByRole('tab',{name:/Меню/}).click();assert.equal(await intro.count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});
 }
 await page.goto(origin);await page.getByText('Попробуйте новое',{exact:true}).waitFor({timeout:30000});
 await page.screenshot({path:path.join(__dirname,'announcement-390.png'),fullPage:true});
 await page.getByRole('tab',{name:/Меню/}).click();
 await page.getByText('ХИТ',{exact:true}).first().waitFor();
 for(const label of ['NEW','СЕЗОН','SBL'])assert.ok(await page.getByText(label,{exact:true}).count());
 await page.screenshot({path:path.join(__dirname,'badges-390.png'),fullPage:true});
 await page.getByRole('tab',{name:/Профиль/}).click();await page.getByRole('button',{name:'Войти',exact:true}).click();
 await page.getByRole('textbox',{name:'Номер телефона'}).fill('+79000000001');
 await page.getByRole('checkbox',{name:'Согласие на обработку персональных данных'}).click();
 await page.getByRole('button',{name:'Получить номер для звонка',exact:true}).click();
 await page.getByText('Рады знакомству',{exact:true}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Номер телефона'}).inputValue(),'+7 (900) 000-00-01');
 assert.equal(loginRequests.length,1);assert.equal(loginRequests[0].intent,'login');
 await page.getByRole('alert').filter({hasText:'Этот номер ещё не зарегистрирован'}).waitFor();
 assert.ok((await page.getByRole('alert').filter({hasText:'Этот номер ещё не зарегистрирован'}).boundingBox()).y<450,'Registration notice must be visible near the top');
 assert.equal(await page.getByText('Только на этом устройстве',{exact:true}).count(),0);
 await page.getByText('Добавить фото',{exact:true}).waitFor();
 await page.screenshot({path:path.join(__dirname,'registration-redirect-390.png'),fullPage:true});
 for(const width of [320,430]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));}
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+'/admin/');
 await page.evaluate(({products})=>{
  window.editorialCaptured=[];
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('boardView').classList.remove('hidden');
  const data=products.map(p=>({...p,catalog_version:1,manual_price:250,sort_order:0,app_content:{name:p.name}}));
  window.SblCatalogAdmin.create({document,isActive:()=>true,getSession:()=>1,confirm:()=>true,crypto:window.crypto,getDb:()=>({rpc:async(name,args)=>{window.editorialCaptured.push({name,args});return {data:name==='staff_list_catalog_products'?{items:data}:{...data[0],catalog_version:2}}}})});
 },{products});
 await page.locator('#catalogBtn').click();await page.locator('[data-catalog-open]').first().click();
 await page.locator('#catalogBadge').fill('ХИТ');
 for(const style of ['orange','holo','silver','black']){await page.locator('#catalogBadgeStyle').selectOption(style);assert.equal(await page.locator('#catalogBadgePreview').getAttribute('data-style'),style);}
 await page.locator('#catalogBadgeStyle').selectOption('holo');
 await page.locator('#catalogBadgePreview').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,'admin-badge-390.png')});
 await page.locator('#catalogPublish').click();
 const captured=await page.evaluate(()=>window.editorialCaptured);assert.equal(captured.find(c=>c.name==='staff_save_catalog_product').args.p_payload.badge,'holo:ХИТ');
 await page.evaluate(({products})=>{
  const rows=[];window.announcementCaptured=[];
  const db={rpc:async(name,args)=>{
   if(name==='staff_list_app_publications')return {data:{server_now:new Date().toISOString(),items:rows}};
   window.announcementCaptured.push({name,args});const row={id:args.p_id,...args.p_payload,version:1,visibility:'active',updated_at:new Date().toISOString()};rows.push(row);return {data:row};
  },from:()=>{const chain={select:()=>chain,eq:()=>chain,order:async()=>({data:products})};return chain;}};
  window.SblContentAdmin.create({document,isActive:()=>true,getSession:()=>1,getDb:()=>db,confirm:()=>true,crypto:window.crypto});
 },{products});
 await page.locator('#contentBtn').click();await page.locator('#publicationKind').selectOption('announcement');
 await page.locator('#publicationTitle').fill('Встречайте новые напитки');await page.locator('#publicationBody').fill('Два новых вкуса в меню');
 await page.locator('#publicationProducts').selectOption(products.slice(0,2).map(p=>p.id));
 await page.locator('#publicationPublish').click();
 await page.waitForFunction(()=>window.announcementCaptured.length===1);
 assert.deepEqual((await page.evaluate(()=>window.announcementCaptured[0].args.p_payload.product_ids)),products.slice(0,2).map(p=>p.id));
 await page.locator('#publicationProducts').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,'admin-announcement-390.png')});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Announcement editor must fit mobile width');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(__dirname,'browser-result.json'),JSON.stringify({ok:true,syntheticOnly:true,realBackendRequests:0,unknownPhoneRedirect:true,phonePreserved:true,avatarLocalHintRemoved:true,errors,screens:['announcement-390.png','badges-390.png','registration-redirect-390.png','admin-badge-390.png','admin-announcement-390.png']},null,2));
 console.log('BROWSER_OK');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
