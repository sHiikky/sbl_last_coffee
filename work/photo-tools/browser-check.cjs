const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),os=require('node:os');
const {chromium}=require(require.resolve('playwright',{paths:[path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')]}));
const root=path.resolve(__dirname,'../..'),base=path.join(root,'kassa-terminal');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pid='11111111-1111-4111-8111-111111111111';
const server=http.createServer((req,res)=>{const file=path.resolve(base,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html');if(!file.startsWith(base+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];let blockedRequests=0;
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=900;const x=c.getContext('2d');x.strokeStyle='#69605a';x.lineWidth=12;x.beginPath();x.moveTo(25,60);x.quadraticCurveTo(15,460,150,540);x.quadraticCurveTo(285,460,275,60);x.closePath();x.fillStyle='#ed6327';x.fill();x.stroke();x.beginPath();x.moveTo(150,540);x.lineTo(150,800);x.moveTo(65,830);x.lineTo(235,830);x.stroke();return c.toDataURL('image/png').split(',')[1];});
 const png=Buffer.from(fixture,'base64');
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();if(u.hostname==='example.test')return route.fulfill({contentType:'image/png',body:png,headers:{'access-control-allow-origin':'*'}});if(u.hostname.includes('jsdelivr'))return route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};'});blockedRequests++;return route.abort();});
 await page.goto(origin);
 await page.evaluate(({uid,pid})=>{
  document.getElementById('loginView').classList.add('hidden');document.getElementById('boardView').classList.remove('hidden');
  window.uploads=[];window.saves=[];window.rows=[];window.failSave=false;window.session=1;window.active=true;
  const product={id:pid,name:'Апероль',price:350,manual_price:350,image_url:'https://example.test/tall.png',menu_category:'Напитки',menu_subcategory:'Холодные',is_visible:true,is_available:true,is_modifier:false,catalog_version:1,app_content:{name:'Апероль'}};
  const db={auth:{getUser:async()=>({data:{user:{id:uid}}})},storage:{from:bucket=>({upload:async(p,blob,options)=>{const image=await createImageBitmap(blob);window.uploads.push({bucket,path:p,options,width:image.width,height:image.height,size:blob.size});image.close();return {};},getPublicUrl:p=>({data:{publicUrl:'https://example.test/'+p}})})},from:()=>{const chain={select:()=>chain,eq:()=>chain,order:async()=>({data:[product]})};return chain;},rpc:async(name,args)=>{
   if(name==='staff_list_catalog_products')return {data:{items:[product]}};
   if(name==='staff_list_app_publications')return {data:{server_now:new Date().toISOString(),items:window.rows}};
   window.saves.push({name,args});if(window.failSave){window.failSave=false;return {error:{code:'CONNECTION_FAILED'}};}
   if(name==='staff_save_catalog_product')return {data:{...product,catalog_version:2}};
   const row={id:args.p_id,...args.p_payload,version:args.p_expected_version+1,updated_at:new Date().toISOString()};window.rows=[row];return {data:row};
  }};
  const options={document,getDb:()=>db,isActive:()=>window.active,getSession:()=>window.session,confirm:()=>true,crypto:window.crypto};
  window.catalog=window.SblCatalogAdmin.create(options);
  const editor=window.SblPhotoComposer.create(document.getElementById('publicationFramePreview')),load=editor.load;window.photoLoads=0;
  editor.load=blob=>{window.photoLoads++;return load(blob);};
  window.content=window.SblContentAdmin.create({...options,photoEditor:editor});
 },{uid,pid});
 await page.locator('#catalogBtn').click();await page.locator('[data-catalog-open]').first().click();
 assert.equal(await page.locator('#catalogImage').getAttribute('type'),'hidden');
 let chooser=page.waitForEvent('filechooser');await page.locator('#catalogPhotoChoose').click();await(await chooser).setFiles({name:'tall.png',mimeType:'image/png',buffer:png});
 await page.waitForFunction(()=>window.uploads.length===1&&!document.getElementById('catalogPublish').disabled);
 await page.locator('#catalogPublish').click();await page.waitForFunction(()=>window.saves.some(s=>s.name==='staff_save_catalog_product'));
 assert.ok((await page.evaluate(()=>window.saves.find(s=>s.name==='staff_save_catalog_product').args.p_payload.image_url)).startsWith('https://example.test/'));
 await page.locator('#catalogPhotoRemove').click();assert.equal(await page.locator('#catalogImage').inputValue(),'');assert.equal(await page.evaluate(()=>window.uploads.length),1);
 await page.locator('#catalogBtn').click();await page.locator('#contentBtn').click();await page.locator('#publicationProduct').selectOption(pid);await page.locator('#publicationUseProductPhoto').click();
 await page.locator('#publicationPhotoControls').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('publicationPublish').disabled);
 assert.equal(await page.locator('#publicationPhotoFit').inputValue(),'contain');assert.equal(await page.locator('#publicationImage').getAttribute('type'),'hidden');
 const pixel=await page.locator('#publicationFramePreview').evaluate(c=>[...c.getContext('2d').getImageData(640,660,1,1).data]);assert.ok(pixel[0]<200,'Full glass stem must be visible near frame bottom');
 await page.locator('#publicationPhotoFit').selectOption('cover');
 await page.locator('#publicationPhotoFit').selectOption('contain');
 await page.locator('#publicationPhotoZoom').fill('80');await page.locator('#publicationPhotoZoom').dispatchEvent('input');
 await page.locator('#publicationPhotoX').fill('20');await page.locator('#publicationPhotoX').dispatchEvent('input');
 await page.locator('#publicationTitle').fill('Новая акция');await page.locator('#publicationBody').fill('Текст для проверки кадра');
 await page.locator('#publicationFramePreview').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,'publication-frame-1440.png')});
 await page.evaluate(()=>window.failSave=true);await page.locator('#publicationSaveDraft').click();
 await page.waitForFunction(()=>window.uploads.length===2&&!document.getElementById('publicationSaveDraft').disabled);
 const baked=await page.evaluate(()=>window.uploads[1]);assert.equal(baked.width,1280);assert.equal(baked.height,720);assert.equal(baked.options.upsert,false);assert.equal(baked.bucket,'catalog-photos');assert.match(baked.path,new RegExp('^'+uid+'/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(webp|png|jpg)$'));
 await page.locator('#publicationSaveDraft').click();await page.waitForFunction(()=>window.rows.length===1&&!document.getElementById('publicationSaveDraft').disabled);assert.equal(await page.evaluate(()=>window.uploads.length),2,'Retry must reuse uploaded image');
 // Device drops use the same validation and editor as the chooser.
 await page.locator('#publicationPhotoDrop').evaluate((zone,b64)=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'tall.png',{type:'image/png'}));zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));},fixture);
 await page.waitForFunction(()=>!document.getElementById('publicationSaveDraft').disabled&&!document.getElementById('publicationFramePreview').classList.contains('hidden'));
 await page.locator('#publicationPhotoRemove').click();assert.equal(await page.locator('#publicationImage').inputValue(),'');await page.locator('#publicationFramePreview').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.uploads.length),2);
 // Closing/logging out while a remote image is pending cannot restore stale UI.
 await page.evaluate(b64=>{window.loadsBeforeLogout=window.photoLoads;window.realFetch=window.fetch;window.fetch=()=>new Promise(resolve=>window.finishPhoto=()=>resolve(new Response(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:'image/png'}))));},fixture);
 await page.locator('#publicationUseProductPhoto').click();await page.waitForFunction(()=>!!window.finishPhoto);
 await page.evaluate(()=>{window.session++;window.active=false;window.content.reset();window.finishPhoto();window.fetch=window.realFetch;});
 await page.locator('#contentPanel').waitFor({state:'hidden'});assert.equal(await page.locator('#publicationImage').inputValue(),'');
 assert.ok(await page.evaluate(()=>window.photoLoads===window.loadsBeforeLogout),'Late valid image must not decode after logout');
 await page.evaluate(()=>{window.active=true;window.session++;});await page.locator('#contentBtn').click();await page.locator('#publicationProduct').selectOption(pid);await page.locator('#publicationUseProductPhoto').click();await page.locator('#publicationPhotoControls').waitFor({state:'visible'});
 for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.locator('#publicationPhotoControls').scrollIntoViewIfNeeded();const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})));if(overflow.length)console.log(JSON.stringify(overflow.slice(-15)));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Editor must fit '+width);}
 await page.setViewportSize({width:390,height:900});await page.locator('#publicationFramePreview').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,'publication-frame-390.png')});
 assert.equal(await page.locator('input[type=url]:visible').count(),0);assert.deepEqual(errors,[]);assert.equal(blockedRequests,0);
 fs.writeFileSync(path.join(__dirname,'browser-result.json'),JSON.stringify({ok:true,syntheticOnly:true,realUploads:0,realBackendRequests:0,chooser:true,drop:true,containFullGlass:true,bakedFrame:[1280,720],retryReusesUpload:true,logoutGuard:true,mobileWidths:[320,390],errors},null,2));console.log('PASS: real browser chooser/drop, full photo frame, scaled WebP upload, save retry, removal, logout guard and responsive editor; synthetic backend only');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
