(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SblCatalogAdmin=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  var photos=typeof module==='object'&&module.exports?require('./photo-upload'):window.SblPhotoUpload;
  var badges=typeof module==='object'&&module.exports?require('./product-badge'):window.SblProductBadge;
  var fields=['Name','Category','Subcategory','Size','IsModifier','Price','PriceMode','Image','Description','Ingredients','Allergens','NutritionBasis','NutritionInherit','Calories','Protein','Fat','Carbs','AllAdditions','Available','QuickPick','Badge','BadgeStyle','Sort'].map(function(s){return 'catalog'+s;});
  function photoUrl(value){
    var text=String(value||'').trim();if(!text)return null;var url;
    try{url=new URL(text);}catch(_){throw Error('Укажите прямую HTTPS-ссылку на фото.');}
    if(text.length>2048||url.protocol!=='https:'||url.username||url.password||/[\s<>"@]/.test(text)||/^https:\/\/api\.sbis\.ru\/img([/?]|$)/i.test(text))throw Error('Для фото нужна прямая HTTPS-ссылка на изображение.');
    return text;
  }
  function decimal(value,label,optional){
    var text=String(value==null?'':value).trim().replace(',','.');if(optional&&!text)return null;
    if(!/^\d+(\.\d{1,2})?$/.test(text))throw Error(label+': укажите число, максимум два знака после запятой.');
    var n=Number(text);if(!Number.isFinite(n)||n>99999999.99)throw Error(label+': слишком большое значение.');return n;
  }
  function payload(v,visible){
    var r={},limits={name:120,description:3000,ingredients:3000,allergens:500,size_label:40,menu_category:80,menu_subcategory:80,badge:32};
    Object.keys(limits).forEach(function(k){var s=String(v[k]||'').trim();if(Array.from(s).length>limits[k]||/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(s))throw Error('Проверьте длину текста и служебные символы.');r[k]=s;});
    r.badge=badges.encode(v.badge,v.badge_style||'orange');
    if(v.description===null)r.description=null;if(!r.name||!r.menu_category)throw Error('Заполните название и категорию.');
    r.price=decimal(v.price,'Цена');r.price_mode=v.price_mode;if(!['manual','sbis'].includes(r.price_mode))throw Error('Выберите источник цены.');
    r.is_modifier=!!v.is_modifier;r.is_visible=!!visible&&!r.is_modifier;r.is_available=!!v.is_available;r.is_quick_pick=!!v.is_quick_pick;r.image_url=photoUrl(v.image_url);
    if(r.is_visible&&!r.image_url)throw Error('Добавьте фото, чтобы показать товар в меню. Пока можно сохранить его скрытым.');
    r.sort_order=Number(v.sort_order);if(!Number.isInteger(r.sort_order)||r.sort_order<0||r.sort_order>1000000)throw Error('Порядок: целое число от 0 до 1000000.');
    r.nutrition_basis=v.nutrition_basis;if(!['portion','100g','100ml','unknown'].includes(r.nutrition_basis))throw Error('Укажите, на какое количество рассчитано КБЖУ.');
    r.nutrition=v.nutrition===null?null:{};if(r.nutrition)['calories','protein','fat','carbs'].forEach(function(k){var n=decimal(v.nutrition&&v.nutrition[k],'КБЖУ',true);if(n!==null){if(n>100000)throw Error('Проверьте КБЖУ.');r.nutrition[k]=n;}});
    r.allowed_modifier_ids=r.is_modifier?[]:v.allowed_modifier_ids===null?null:Array.from(new Set(v.allowed_modifier_ids||[])).sort();
    if(r.allowed_modifier_ids&&(r.allowed_modifier_ids.length>200||r.allowed_modifier_ids.some(function(id){return !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);})))throw Error('Проверьте выбранные добавки.');return r;
  }
  function errorText(e){
    var m=String(e&&e.message||'');
    if(e&&['PGRST202','42883','42703','42P01'].includes(e.code))return 'Раздел товаров ещё не включён в базе. Нужна миграция 20261102100000_product_catalog_admin.sql.';
    if(m.includes('CATALOG_CONFLICT'))return 'Товар уже изменён другим сотрудником или синхронизацией. Ваши данные остались в форме. Обновите список и откройте актуальную версию.';
    if(m.includes('CATALOG_SBIS_PRICE_UNKNOWN'))return 'Текущая цена СБИС ещё не получена. Оставьте ручную цену до следующей синхронизации.';
    if(m.includes('CATALOG_PHOTO_REQUIRED'))return 'Для показа в меню добавьте фото.';
    if(m.includes('CATALOG_MODIFIER_NOT_FOUND'))return 'Добавка удалена или больше не является добавкой. Обновите список и выберите её заново.';
    if(m.includes('STAFF_REQUIRED')||e&&['42501','403'].includes(String(e.code)))return 'Для изменения товаров нужен вход сотрудника кофейни.';
    if(m.includes('INVALID_CATALOG')||m.includes('CATALOG_'))return 'Проверьте название, категорию, цену, фото и добавки.';
    return 'Не удалось завершить действие. Проверьте связь. Если ответ на сохранение потерялся, повторите сохранение той же формы: второй товар не создастся.';
  }
  function splitTitle(value){var s=String(value||'').trim(),m=s.match(/[\s,(]*(\d+[.,]?\d*\s?(?:мл|л|г|гр|кг))\.?\)?\s*$/i);return m?{name:s.slice(0,m.index).trim()||s,size:m[1]}:{name:s,size:''};}
  function create(options){
    var doc=options.document||document,el=function(id){return doc.getElementById(id);},panel=el('catalogPanel');
    var rows=[],current=null,selected=new Set(),edited=new Set(),dirty=false,busy=false,generation=0;
    var confirm=options.confirm||function(){return true;};
    function node(tag,cls,text){var n=doc.createElement(tag);n.className=cls||'';if(text!=null)n.textContent=text;return n;}
    function active(){return options.isActive()&&!panel.classList.contains('hidden');}
    function valid(stamp,session){return active()&&stamp===generation&&session===options.getSession();}
    function message(s,error){el('catalogStatus').textContent=s||'';el('catalogStatus').classList.toggle('catalog-error',!!error);}
    function discard(){return !dirty||confirm('Есть несохранённые изменения товара. Открыть другую позицию и потерять их?');}
    function mark(){dirty=true;el('catalogDirty').textContent='Есть несохранённые изменения';el('catalogDirty').classList.add('is-dirty');}
    function constraints(){
      el('catalogIsModifier').disabled=busy||!!(current&&current.catalog_version);
      var manualOnly=!current||current.sbis_id==null;el('catalogPriceMode').querySelector('option[value="sbis"]').disabled=manualOnly;
      if(manualOnly)el('catalogPriceMode').value='manual';var auto=el('catalogPriceMode').value==='sbis';el('catalogPrice').disabled=busy||auto;
      el('catalogPriceHint').textContent=auto?'Цена обновляется из СБИС. Фото, описание и настройки приложения сохраняются.':'Ручная цена сохранится при обновлении каталога СБИС.';
      el('catalogAdditionsField').classList.toggle('hidden',el('catalogIsModifier').checked);el('catalogPublish').textContent=el('catalogIsModifier').checked?'Сохранить добавку':'Сохранить и показать в меню';
      ['Calories','Protein','Fat','Carbs'].forEach(function(k){el('catalog'+k).disabled=busy||el('catalogNutritionInherit').checked;});
      doc.querySelectorAll('[data-catalog-modifier]').forEach(function(n){n.disabled=busy||el('catalogAllAdditions').checked;});
    }
    function setBusy(b){busy=b;if(photoInput)photoInput.setDisabled(b);fields.concat(['catalogFile','catalogNew','catalogRefresh','catalogSaveHidden','catalogPublish']).forEach(function(id){el(id).disabled=b;});doc.querySelectorAll('[data-catalog-open]').forEach(function(n){n.disabled=b;});constraints();}
    function badgePreview(){
      var badge=el('catalogBadgePreview'),text=el('catalogBadge').value.trim();
      badge.textContent=text;badge.dataset.style=el('catalogBadgeStyle').value||'orange';badge.hidden=!text;
    }
    function preview(){badgePreview();el('catalogPhotoRemove').classList.toggle('hidden',!el('catalogImage').value);var url;try{url=photoUrl(el('catalogImage').value);}catch(_){}var img=el('catalogPreview');if(url){if(img.getAttribute('src')!==url)img.src=url;img.classList.remove('hidden');}else{img.removeAttribute('src');img.classList.add('hidden');}}
    function renderModifiers(){
      var list=el('catalogModifiers');list.replaceChildren();rows.filter(function(r){return r.is_modifier;}).forEach(function(r){
        var label=node('label','catalog-check'),input=node('input');input.type='checkbox';input.dataset.catalogModifier=r.id;input.checked=selected.has(r.id);
        input.addEventListener('change',function(){if(input.checked)selected.add(r.id);else selected.delete(r.id);mark();});label.appendChild(input);
        label.appendChild(node('span','',(r.app_content&&r.app_content.name||r.display_name||r.name)+' · '+Number(r.price).toLocaleString('ru-RU')+' ₽'+(r.is_available===false?' · стоп-лист':'')));list.appendChild(label);
      });if(!list.childNodes.length)list.appendChild(node('p','catalog-hint','Добавок пока нет. Создайте позицию с отметкой «Это платная добавка».'));constraints();
    }
    function renderList(){
      var list=el('catalogRows');list.replaceChildren();var term=el('catalogSearch').value.trim().toLocaleLowerCase('ru');
      rows.filter(function(r){return (el('catalogShowModifiers').checked||!r.is_modifier)&&[r.name,r.display_name,r.menu_category,r.menu_subcategory].join(' ').toLocaleLowerCase('ru').includes(term);}).forEach(function(r){
        var b=node('button','catalog-row');b.type='button';b.dataset.catalogOpen=r.id;b.setAttribute('aria-pressed',String(!!current&&current.id===r.id));b.disabled=busy;
        var url;try{url=photoUrl(r.image_override_url||r.image_url);}catch(_){}if(url){var img=node('img');img.src=url;img.alt='';img.loading='lazy';img.addEventListener('error',function(){img.classList.add('hidden');});b.appendChild(img);}
        var info=node('span');info.appendChild(node('strong','',r.app_content&&r.app_content.name||r.display_name||r.name));info.appendChild(node('small','',Number(r.price).toLocaleString('ru-RU')+' ₽ · '+(r.is_modifier?'Добавка':r.is_visible?'В меню':'Скрыт')+(r.is_available===false?' · стоп-лист':'')));b.appendChild(info);
        b.addEventListener('click',function(){if(!busy&&discard())select(r);});list.appendChild(b);
      });if(!list.childNodes.length)list.appendChild(node('p','catalog-hint','Товары не найдены.'));
      var cats=new Set(['Напитки','Еда','Десерты','Магазин']),subs=new Set();rows.forEach(function(r){if(r.menu_category)cats.add(r.menu_category);if(r.menu_subcategory)subs.add(r.menu_subcategory);});
      [['catalogCategories',cats],['catalogSubcategories',subs]].forEach(function(pair){var list=el(pair[0]);list.replaceChildren();pair[1].forEach(function(v){var o=node('option');o.value=v;list.appendChild(o);});});
    }
    function select(row){
      current=row;var c=row.app_content||{},parsed=splitTitle(row.display_name||row.name);
      var v={Name:c.name||parsed.name,Category:row.menu_category||'Напитки',Subcategory:row.menu_subcategory||'',Size:c.size_label!=null?c.size_label:parsed.size,Price:row.price==null?'':row.price,PriceMode:row.sbis_id!=null&&row.manual_price==null?'sbis':'manual',Image:row.image_override_url||row.image_url||'',Description:c.description!=null?c.description:row.description||'',Ingredients:c.ingredients||'',Allergens:c.allergens||'',NutritionBasis:c.nutrition_basis||'unknown',Badge:badges.parse(row.badge).text,BadgeStyle:badges.parse(row.badge).style,Sort:row.sort_order||0};
      Object.keys(v).forEach(function(k){el('catalog'+k).value=v[k];});var n=c.nutrition||{};['Calories','Protein','Fat','Carbs'].forEach(function(k){el('catalog'+k).value=n[k.toLowerCase()]==null?'':n[k.toLowerCase()];});
      el('catalogIsModifier').checked=!!row.is_modifier;el('catalogAvailable').checked=row.is_available!==false;el('catalogQuickPick').checked=!!row.is_quick_pick;el('catalogNutritionInherit').checked=!!row.catalog_version&&c.nutrition==null;if(!row.catalog_version)el('catalogNutritionBasis').value='portion';
      el('catalogAllAdditions').checked=row.allowed_modifier_ids==null;selected=new Set(row.allowed_modifier_ids||[]);el('catalogEditing').textContent=row.catalog_version?'Редактирование товара':'Новая позиция';el('catalogSource').textContent=row.sbis_id==null?'Создан в приложении':'Из СБИС';
      el('catalogDirty').textContent=row.catalog_version?'Изменения сохранены':'Позиция пока только в форме';el('catalogDirty').classList.toggle('is-dirty',!row.catalog_version);el('catalogFile').value='';el('catalogUploadStatus').textContent='';edited=new Set();dirty=false;renderList();renderModifiers();preview();setBusy(false);
    }
    function newProduct(){if(busy||!discard())return;var crypto=options.crypto||window.crypto;if(!crypto||!crypto.randomUUID){message('Откройте панель через HTTPS или localhost.',true);return;}select({id:crypto.randomUUID(),catalog_version:0,price:'',sbis_id:null,is_available:true,allowed_modifier_ids:[]});message('Заполните карточку. До сохранения товар не появится в приложении.');}
    function values(){var c=current.app_content||{};return {name:el('catalogName').value,menu_category:el('catalogCategory').value,menu_subcategory:el('catalogSubcategory').value,size_label:el('catalogSize').value,price:el('catalogPrice').value,price_mode:el('catalogPriceMode').value,image_url:el('catalogImage').value,description:!edited.has('catalogDescription')&&current.catalog_version&&c.description==null&&!current.description?null:el('catalogDescription').value,ingredients:el('catalogIngredients').value,allergens:el('catalogAllergens').value,nutrition_basis:el('catalogNutritionBasis').value,nutrition:el('catalogNutritionInherit').checked?null:{calories:el('catalogCalories').value,protein:el('catalogProtein').value,fat:el('catalogFat').value,carbs:el('catalogCarbs').value},allowed_modifier_ids:el('catalogAllAdditions').checked?null:Array.from(selected),is_modifier:el('catalogIsModifier').checked,is_available:el('catalogAvailable').checked,is_quick_pick:el('catalogQuickPick').checked,badge:el('catalogBadge').value,badge_style:el('catalogBadgeStyle').value,sort_order:el('catalogSort').value};}
    async function refresh(){
      if(!active()||busy)return false;var stamp=++generation,session=options.getSession();setBusy(true);message('Загружаем товары…');
      try{var r=await options.getDb().rpc('staff_list_catalog_products');if(!valid(stamp,session))return false;if(r.error)throw r.error;if(!r.data||!Array.isArray(r.data.items))throw Error('Malformed catalog');rows=r.data.items;renderList();renderModifiers();setBusy(false);if(!current)newProduct();else if(!dirty){var latest=rows.find(function(r){return r.id===current.id;});if(latest)select(latest);}message('Загружено позиций: '+rows.length+'.');return true;}
      catch(e){if(valid(stamp,session))message(errorText(e),true);return false;}finally{if(valid(stamp,session))setBusy(false);}
    }
    async function save(visible){
      if(!active()||busy||!current)return false;var data;try{data=payload(values(),visible);}catch(e){message(e.message,true);return false;}if(!visible&&current.is_visible&&!confirm('Скрыть товар из меню приложения? История заказов сохранится.'))return false;
      var stamp=++generation,session=options.getSession(),id=current.id,version=current.catalog_version||0;setBusy(true);message('Сохраняем товар…');
      try{var r=await options.getDb().rpc('staff_save_catalog_product',{p_id:id,p_expected_version:version,p_payload:data});if(!valid(stamp,session))return false;if(r.error)throw r.error;if(!r.data||r.data.id!==id||!Number.isInteger(r.data.catalog_version))throw Error('Malformed save response');
        var i=rows.findIndex(function(r){return r.id===id;});if(i<0)rows.unshift(r.data);else rows[i]=r.data;select(r.data);message(data.is_modifier?'Добавка сохранена. Выберите её в разрешённых добавках нужных товаров.':visible?'Товар показан в меню. Приложение обновит каталог при открытии или в течение 30 секунд.':'Товар сохранён скрытым. Гости его не видят.');return true;}
      catch(e){if(valid(stamp,session))message(errorText(e),true);return false;}finally{if(valid(stamp,session))setBusy(false);}
    }
    async function preparePhoto(file){
      if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>26214400)throw Error('Выберите JPG, PNG или WebP размером до 25 МБ.');
      var bitmap=await createImageBitmap(file);try{if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>50000000)throw Error('Выберите фото до 50 мегапикселей.');
        var scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=doc.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        var blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/webp',.84);});if(!blob||blob.size>2097152||!['image/webp','image/png','image/jpeg'].includes(blob.type))throw Error('Фото не удалось уменьшить до 2 МБ. Выберите изображение меньшего размера.');return blob;
      }finally{bitmap.close();}
    }
    async function upload(file){
      if(!active()||busy||!current||!file)return false;var stamp=++generation,session=options.getSession(),id=current.id;setBusy(true);el('catalogUploadStatus').textContent='Подготавливаем и загружаем фото…';
      try{var blob=await(options.preparePhoto||preparePhoto)(file);if(!valid(stamp,session))return false;var db=options.getDb(),user=await db.auth.getUser();if(!valid(stamp,session))return false;if(user.error)throw user.error;if(!user.data||!user.data.user)throw Error('STAFF_REQUIRED');
        var ext={'image/webp':'webp','image/png':'png','image/jpeg':'jpg'}[blob.type],crypto=options.crypto||window.crypto;if(!ext||blob.size>2097152)throw Error('INVALID_CATALOG_PHOTO');
        var path=user.data.user.id+'/'+id+'/'+crypto.randomUUID()+'.'+ext,bucket=db.storage.from('catalog-photos'),r=await bucket.upload(path,blob,{contentType:blob.type,upsert:false,cacheControl:'31536000'});
        if(!valid(stamp,session))return false;if(r.error)throw r.error;el('catalogImage').value=photoUrl(bucket.getPublicUrl(path).data.publicUrl);edited.add('catalogImage');mark();preview();el('catalogUploadStatus').textContent='Фото загружено. Сохраните карточку, чтобы привязать его к товару.';return true;
      }catch(e){if(valid(stamp,session)){el('catalogUploadStatus').textContent='Фото не загружено.';message(e&&/Выберите|Фото|изображение|мегапикселей/.test(e.message)?e.message:errorText(e),true);}return false;}finally{if(valid(stamp,session)){el('catalogFile').value='';setBusy(false);}}
    }
    function reset(){generation++;rows=[];current=null;selected=new Set();edited=new Set();dirty=false;busy=false;panel.classList.add('hidden');fields.forEach(function(id){if(el(id).type==='checkbox')el(id).checked=false;else el(id).value='';});el('catalogRows').replaceChildren();el('catalogModifiers').replaceChildren();el('catalogFile').value='';el('catalogUploadStatus').textContent='';el('catalogEditing').textContent='Новый товар';el('catalogSource').textContent='';el('catalogDirty').textContent='';message('');preview();setBusy(false);}
    el('catalogBtn').addEventListener('click',function(){if(!options.isActive())return;if(panel.classList.contains('hidden')){panel.classList.remove('hidden');refresh();}else if(!busy&&discard()){panel.classList.add('hidden');generation++;}});
    el('catalogRefresh').addEventListener('click',refresh);el('catalogNew').addEventListener('click',newProduct);el('catalogSaveHidden').addEventListener('click',function(){save(false);});el('catalogPublish').addEventListener('click',function(){save(true);});el('catalogSearch').addEventListener('input',renderList);el('catalogShowModifiers').addEventListener('change',renderList);
    el('catalogForm').addEventListener('submit',function(e){e.preventDefault();});fields.forEach(function(id){['input','change'].forEach(function(event){el(id).addEventListener(event,function(){edited.add(id);mark();if(id==='catalogImage')preview();if(id==='catalogBadge'||id==='catalogBadgeStyle')badgePreview();if(id==='catalogPriceMode'&&el(id).value==='sbis'&&current)el('catalogPrice').value=current.sbis_price==null?current.price:current.sbis_price;constraints();});});});
    var photoInput=photos.bind({input:el('catalogFile'),zone:el('catalogPhotoDrop'),choose:el('catalogPhotoChoose'),remove:el('catalogPhotoRemove'),isDisabled:function(){return busy||!active()||!current;},onFile:upload,onError:function(text){message(text,true);},onRemove:function(){el('catalogImage').value='';edited.add('catalogImage');mark();preview();el('catalogUploadStatus').textContent='Фото убрано из формы. Сохраните карточку, чтобы применить.';}});el('catalogPreview').addEventListener('error',function(){el('catalogPreview').classList.add('hidden');message('Фото не открылось. Проверьте ссылку или загрузите файл с компьютера.',true);});
    if(typeof window!=='undefined')window.addEventListener('beforeunload',function(e){if(dirty&&options.isActive()){e.preventDefault();e.returnValue='';}});
    reset();return {reset:reset,refresh:refresh,save:save,upload:upload,newProduct:newProduct,isOpen:active};
  }
  return {create:create,payload:payload,photoUrl:photoUrl,decimal:decimal,errorText:errorText,splitTitle:splitTitle};
});
