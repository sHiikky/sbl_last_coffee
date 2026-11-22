(function(factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else window.SblContentAdmin = factory();
})(function(){
  'use strict';
  var fieldNames = ['publicationKind','publicationTitle','publicationBody','publicationImage','publicationProduct','publicationStarts','publicationEnds'];
  var labels = { draft:'Черновик', scheduled:'Запланировано', active:'На главном экране', expired:'Срок завершён', archived:'Архив' };

  function imageUrl(value){
    var text = String(value || '').trim();
    if (!text) return null;
    if (text.length > 2048 || /[\s<>"@]/.test(text)) throw new Error('Для фото нужна прямая HTTPS-ссылка без логина и пароля.');
    var url;
    try { url = new URL(text); } catch (_) { throw new Error('Проверьте ссылку на фотографию.'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('Для фото нужна HTTPS-ссылка.');
    return text;
  }
  function toTomskInput(value){
    if (!value) return '';
    var time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time + 7 * 3600000).toISOString().slice(0,16) : '';
  }
  function fromTomskInput(value){
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Проверьте дату и время по Томску.');
    var parsed = new Date(value + ':00+07:00');
    if (!Number.isFinite(parsed.getTime()) || toTomskInput(parsed.toISOString()) !== value) throw new Error('Проверьте дату и время по Томску.');
    return parsed.toISOString();
  }
  function makePayload(values,status){
    var title = String(values.title || '').trim(), body = String(values.body || '').replace(/\r\n?/g,'\n').trim();
    if (!title || Array.from(title).length > 100) throw new Error('Заголовок — от 1 до 100 символов.');
    if (!body || Array.from(body).length > 3000) throw new Error('Текст — от 1 до 3000 символов.');
    if (/[\x00-\x1f\x7f-\x9f]/.test(title) || /[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(body)) throw new Error('Уберите служебные символы из текста.');
    if (!['news','promotion'].includes(values.kind) || !['draft','published','archived'].includes(status)) throw new Error('Выберите тип публикации.');
    var start = fromTomskInput(values.starts), end = fromTomskInput(values.ends);
    if (start && end && Date.parse(end) <= Date.parse(start)) throw new Error('Окончание должно быть позже начала.');
    if (status === 'published' && values.kind === 'promotion' && !end) throw new Error('Укажите дату окончания акции.');
    return { kind:values.kind,title:title,body:body,image_url:imageUrl(values.image),product_id:values.product || null,status:status,starts_at:start,ends_at:end };
  }
  function readableError(error){
    var message = String(error && error.message || '');
    if (error && ['PGRST202','42883','42P01'].includes(error.code)) return 'Раздел публикаций ещё не включён в базе. Нужна миграция 20261029120000_app_publications.sql.';
    if (message.includes('PUBLICATION_CONFLICT')) return 'Материал уже изменён другим сотрудником. Обновите список и откройте актуальную версию; ваш текст пока сохранён в форме.';
    if (message.includes('PUBLICATION_ALREADY_EXPIRED')) return 'Дата окончания уже прошла. Измените расписание перед публикацией.';
    if (message.includes('PUBLICATION_PROMOTION_END_REQUIRED')) return 'Укажите дату окончания акции.';
    if (message.includes('STAFF_REQUIRED') || error && error.code === '42501') return 'Недостаточно прав. Войдите как сотрудник кофейни.';
    if (message.includes('PUBLICATION_PRODUCT_UNAVAILABLE')) return 'Связанный товар скрыт или удалён. Выберите другой товар либо уберите связь.';
    if (message.startsWith('INVALID_PUBLICATION')) return 'Проверьте текст, HTTPS-ссылку и расписание публикации.';
    return 'Не удалось сохранить или загрузить материал. Проверьте связь и обновите список перед повтором.';
  }
  function create(options){
    var doc = options.document || document, el = function(id){ return doc.getElementById(id); };
    var panel = el('contentPanel'), status = el('contentStatus'), form = el('publicationForm');
    var rows = [], products = [], current = null, dirty = false, busy = false, generation = 0, serverTime = null;
    function node(tag,className,text){ var item=doc.createElement(tag); item.className=className || ''; if(text != null)item.textContent=text; return item; }
    function active(){ return options.isActive() && !panel.classList.contains('hidden'); }
    function valid(stamp,session){ return active() && stamp===generation && session===options.getSession(); }
    function confirmDiscard(){ return !dirty || options.confirm('Есть несохранённые изменения. Открыть другой материал и потерять их?'); }
    function message(text,isError){ status.textContent=text || ''; status.classList.toggle('content-error',!!isError); }
    function values(){ return { kind:el('publicationKind').value,title:el('publicationTitle').value,body:el('publicationBody').value,image:el('publicationImage').value,product:el('publicationProduct').value,starts:el('publicationStarts').value,ends:el('publicationEnds').value }; }
    function updatePush(){ el('publicationPush').disabled=busy || dirty || !current || current.version===0 || (current.visibility || current.status)!=='active'; }
    function setBusy(value){
      busy=value;
      fieldNames.concat(['publicationNew','publicationSaveDraft','publicationPublish','publicationArchive','publicationUseProductPhoto','contentRefresh']).forEach(function(id){ el(id).disabled=value; });
      el('publicationArchive').disabled=value || !current || current.version===0;
      doc.querySelectorAll('[data-publication-open]').forEach(function(button){ button.disabled=value; });
    }
    function showPreview(){
      var v=values(); el('publicationPreviewKind').textContent=v.kind==='promotion'?'Акция':'Новость';
      el('publicationPreviewTitle').textContent=v.title.trim() || 'Заголовок публикации';
      el('publicationPreviewBody').textContent=v.body.trim() || 'Здесь будет текст для гостей кофейни.';
      var image=el('publicationPreviewImage'), url=null;
      try { url=imageUrl(v.image); } catch (_) {}
      if (url && image.getAttribute('src')!==url) { image.src=url; image.classList.remove('hidden'); }
      if (!url) { image.removeAttribute('src'); image.classList.add('hidden'); }
      el('publicationDirty').textContent=dirty?'Есть несохранённые изменения':current && current.version===0?'Новая публикация ещё не сохранена':'Изменения сохранены';
      el('publicationDirty').classList.toggle('is-dirty',!!dirty || !!current && current.version===0);
      updatePush();
      el('publicationTitleCount').textContent=Array.from(v.title).length+' / 100';
      el('publicationBodyCount').textContent=Array.from(v.body).length+' / 3000';
    }
    function select(row){
      current=row;
      renderProducts();
      el('publicationKind').value=row.kind || 'news';
      el('publicationTitle').value=row.title || ''; el('publicationBody').value=row.body || '';
      el('publicationImage').value=row.image_url || ''; el('publicationProduct').value=row.product_id || '';
      el('publicationStarts').value=toTomskInput(row.starts_at); el('publicationEnds').value=toTomskInput(row.ends_at);
      el('publicationEditing').textContent=row.version?'Редактирование · версия '+row.version:'Новая публикация';
      el('publicationCurrentState').textContent=labels[row.visibility || row.status] || 'Черновик';
      el('publicationCurrentState').dataset.state=row.visibility || row.status || 'draft';
      el('publicationSaveDraft').textContent=row.status==='published'?'Снять с публикации и сохранить черновик':'Сохранить черновик';
      el('publicationPublish').textContent=row.status==='published'?'Обновить публикацию':'Опубликовать';
      dirty=false; showPreview(); renderList(); setBusy(busy);
    }
    function newDraft(){
      if (busy || !confirmDiscard()) return;
      var crypto = options.crypto || window.crypto;
      if (!crypto || typeof crypto.randomUUID!=='function') { message('Для редактора откройте кассу через HTTPS или localhost в современном браузере.',true); return; }
      select({id:crypto.randomUUID(),version:0,status:'draft',kind:'news'}); message('Черновик пока только в форме. Сохраните его, чтобы продолжить позже.');
    }
    function renderList(){
      var root=el('publicationRows'); root.replaceChildren();
      var search=el('publicationSearch').value.toLocaleLowerCase('ru');
      var selected=rows.filter(function(row){ return (el('publicationShowArchive').checked || row.status!=='archived') && (row.title+' '+row.body).toLocaleLowerCase('ru').includes(search); });
      if (!selected.length) { root.appendChild(node('p','content-hint','Публикаций пока нет. Создайте новость или акцию — гости увидят только опубликованные материалы.')); return; }
      selected.forEach(function(row){
        var button=node('button','publication-row'+(current && current.id===row.id?' is-selected':'')); button.type='button'; button.dataset.publicationOpen=row.id;
        var stateKey=row.visibility || row.status, chip=node('span','state-chip',labels[stateKey] || labels[row.status] || labels.draft); chip.dataset.state=stateKey;
        var head=node('span','publication-row-head'); head.append(node('span','publication-row-title',row.title),chip);
        button.append(head,node('span','publication-row-meta',(row.kind==='promotion'?'Акция':'Новость')+' · '+new Date(row.updated_at).toLocaleDateString('ru-RU',{timeZone:'Asia/Tomsk'})));
        button.addEventListener('click',function(){ if (!busy && confirmDiscard()) { select(row); message(''); } }); root.appendChild(button);
      }); setBusy(busy);
    }
    function renderProducts(){
      var selectEl=el('publicationProduct'); var chosen=selectEl.value; selectEl.replaceChildren();
      var none=node('option','','Без перехода к товару'); none.value=''; selectEl.appendChild(none);
      products.forEach(function(product){ var option=node('option','',product.display_name || product.name); option.value=product.id; selectEl.appendChild(option); });
      if (current && current.product_id && !products.some(function(product){ return product.id===current.product_id; })) {
        var hidden=node('option','','Товар скрыт или недоступен — уберите связь'); hidden.value=current.product_id; selectEl.appendChild(hidden);
      }
      selectEl.value=chosen || current && current.product_id || '';
    }
    async function refresh(){
      if (!active() || busy) return false;
      var stamp=++generation, session=options.getSession(); setBusy(true); message('Загружаем публикации…');
      try {
        var db=options.getDb();
        var result=await Promise.all([
          db.rpc('staff_list_app_publications'),
          db.from('products').select('id,name,display_name,image_override_url,image_url').eq('is_visible',true).eq('is_modifier',false).order('name')
        ]);
        if (!valid(stamp,session)) return false;
        if (result[0].error) throw result[0].error;
        if (result[1].error) throw result[1].error;
        var data=result[0].data;
        if (!data || !Array.isArray(data.items) || !Number.isFinite(Date.parse(data.server_now))) throw new Error('Malformed content response');
        rows=data.items; serverTime=data.server_now; products=result[1].data || [];
        renderProducts(); renderList();
        el('contentServerTime').textContent='Серверное время: '+new Date(serverTime).toLocaleString('ru-RU',{timeZone:'Asia/Tomsk'})+' · Томск';
        message('Обновлено. Показаны последние 200 материалов.');
        setBusy(false);
        if (!current) newDraft();
        else if (!dirty) {
          var updated=rows.find(function(row){ return row.id===current.id; });
          if (updated) select(updated);
        }
        return true;
      } catch (error) { if (valid(stamp,session)) message(readableError(error),true); return false; }
      finally { if (valid(stamp,session)) setBusy(false); }
    }
    async function save(target){
      if (!active() || busy || !current) return false;
      var payload;
      try { payload=makePayload(values(),target); } catch(error){ message(error.message,true); return false; }
      if (current.version && values().starts===toTomskInput(current.starts_at)) payload.starts_at=current.starts_at;
      if (current.version && values().ends===toTomskInput(current.ends_at)) payload.ends_at=current.ends_at || null;
      if (target==='published' && !options.confirm('Опубликовать «'+payload.title+'» по указанному расписанию? Гости увидят материал на главном экране.')) return false;
      if (target==='archived' && !options.confirm('Убрать материал в архив? Он перестанет отображаться гостям.')) return false;
      if (target==='draft' && current.status==='published' && !options.confirm('Снять материал с главного экрана и сохранить черновик?')) return false;
      var stamp=++generation, session=options.getSession(), id=current.id, version=current.version; setBusy(true); message('Сохраняем…');
      try {
        var result=await options.getDb().rpc('staff_save_app_publication',{p_id:id,p_expected_version:version,p_payload:payload});
        if (!valid(stamp,session)) return false;
        if (result.error) throw result.error;
        if (!result.data || result.data.id!==id || !Number.isInteger(result.data.version)) throw new Error('Malformed content response');
        select(result.data); setBusy(false); await refresh();
        if (active() && session===options.getSession()) message(target==='published'?'Публикация сохранена. Расписание применяется по серверному времени; приложение обновит ленту при открытии главной или в течение 30 секунд.':target==='archived'?'Материал в архиве.':'Черновик сохранён. Гостям он не виден.');
        return true;
      } catch(error){ if (valid(stamp,session)) message(readableError(error),true); return false; }
      finally { if (valid(stamp,session)) setBusy(false); }
    }
    function reset(){
      generation++; rows=[]; products=[]; current=null; dirty=false; busy=false; serverTime=null;
      panel.classList.add('hidden'); message(''); el('publicationRows').replaceChildren(); el('contentServerTime').textContent='';
      fieldNames.forEach(function(id){ el(id).value=''; }); el('publicationKind').value='news';
      el('publicationPreviewImage').removeAttribute('src'); showPreview(); setBusy(false);
    }
    el('contentBtn').addEventListener('click',function(){
      if (!options.isActive()) return;
      if (panel.classList.contains('hidden')) { panel.classList.remove('hidden'); refresh(); }
      else { if (busy || !confirmDiscard()) return; panel.classList.add('hidden'); generation++; current=null; dirty=false; }
    });
    el('contentRefresh').addEventListener('click',refresh);
    el('publicationNew').addEventListener('click',newDraft);
    el('publicationSaveDraft').addEventListener('click',function(){ save('draft'); });
    el('publicationPublish').addEventListener('click',function(){ save('published'); });
    el('publicationArchive').addEventListener('click',function(){ save('archived'); });
    el('publicationPush').addEventListener('click',async function(){
      if (busy || !current || current.version===0 || dirty) return;
      if (!options.confirm('Отправить пуш «'+current.title+'» всем гостям, которые разрешили акции и новости? Повторно по этой публикации отправить нельзя.')) return;
      var session=options.getSession(), stamp=generation, id=current.id;
      setBusy(true); message('Ставим рассылку в очередь…');
      try {
        var result=await options.getDb().rpc('staff_send_publication_push',{p_publication_id:id});
        if (!valid(stamp,session)) return;
        if (result.error) throw result.error;
        var queued=Number(result.data && result.data.queued) || 0;
        var n10=queued%10, n100=queued%100, word=n10===1&&n100!==11?'устройство':n10>=2&&n10<=4&&(n100<12||n100>14)?'устройства':'устройств';
        message(queued?'Рассылка поставлена в очередь: '+queued+' '+word+'. Доставка — в часы работы кофейни (11:00–20:00 по Томску).':'Нет гостей, согласившихся на акции и новости: отправлять некому.');
      } catch (error) {
        if (!valid(stamp,session)) return;
        var text=String(error && (error.message || error.code) || '');
        message(/ALREADY_SENT/.test(text)?'Пуш по этой публикации уже отправлялся.'
          :/NOT_ACTIVE/.test(text)?'Пуш можно отправить только для активной опубликованной записи.'
          :/PUSH_RATE_LIMIT/.test(text)?'Слишком часто: не больше одного пуша в час и двух в сутки. Попробуйте позже.'
          :/ENDS_BEFORE_OPENING/.test(text)?'Публикация закончится до открытия кофейни — пуш уже не успеет дойти.'
          :/STAFF_REQUIRED/.test(text)?'Нет прав сотрудника для рассылки. Войдите заново.'
          :'Не удалось поставить рассылку в очередь. Проверьте связь и повторите позже.',true);
      } finally { if (valid(stamp,session)) setBusy(false); }
    });
    el('publicationSearch').addEventListener('input',renderList);
    el('publicationShowArchive').addEventListener('change',renderList);
    form.addEventListener('submit',function(event){ event.preventDefault(); });
    fieldNames.forEach(function(id){ ['input','change'].forEach(function(event){ el(id).addEventListener(event,function(){ dirty=true; showPreview(); }); }); });
    el('publicationUseProductPhoto').addEventListener('click',function(){
      var product=products.find(function(item){ return item.id===el('publicationProduct').value; });
      if (!product) { message('Сначала выберите товар.',true); return; }
      try { el('publicationImage').value=imageUrl(product.image_override_url || product.image_url) || ''; dirty=true; showPreview(); }
      catch(error){ message(error.message,true); }
    });
    el('publicationPreviewImage').addEventListener('error',function(){ el('publicationPreviewImage').classList.add('hidden'); message('Изображение не загрузилось. Проверьте, что ссылка открывает сам файл фотографии.',true); });
    reset();
    return { reset:reset,refresh:refresh,isOpen:active };
  }
  return { create:create,imageUrl:imageUrl,toTomskInput:toTomskInput,fromTomskInput:fromTomskInput,makePayload:makePayload,readableError:readableError };
});
