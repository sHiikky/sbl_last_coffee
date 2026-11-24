/* Оформление выбора поверх обычных <select>:
   - сегментная полоска (2–3 варианта) со скользящим ползунком;
   - собственный выпадающий список.
   Исходный <select> остаётся в DOM и остаётся источником значения:
   остальной код кассы читает и пишет его как раньше (select.value = …,
   change/input, disabled, замена списка options). */
(function(){
  'use strict';
  var valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  var openList = null;

  function hideSource(select){
    select.classList.add('seg-source'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
  }
  function labelText(select){
    var label = select.closest('label'); if (!label) return '';
    var node = label.querySelector('.label-row > span') || label.firstChild;
    return (node && node.textContent || '').trim();
  }
  function fire(select){
    select.dispatchEvent(new Event('input', { bubbles:true })); select.dispatchEvent(new Event('change', { bubbles:true }));
  }
  /* перехват select.value = … и слежение за disabled / сменой списка options */
  function watch(select, sync){
    Object.defineProperty(select, 'value', {
      configurable: true,
      get: function(){ return valueDesc.get.call(select); },
      set: function(v){ valueDesc.set.call(select, v); sync(); }
    });
    new MutationObserver(sync).observe(select, { attributes:true, attributeFilter:['disabled'], childList:true, subtree:true });
    // Скрытый select всё же может получить фокус (клик по подписи, клавиатура): любое его
    // собственное изменение сразу отражаем в видимом контроле, иначе экран и форма расходятся.
    select.addEventListener('change', sync); select.addEventListener('input', sync);
  }
  /* клик внутри своего контрола не должен «активировать» подпись <label>: она перевела бы
     фокус на скрытый select, и стрелки клавиатуры меняли бы невидимое значение */
  function keepFocusInside(root){ root.addEventListener('click', function(event){ event.preventDefault(); }); }

  /* ---------- сегментная полоска ---------- */
  function segmented(select){
    if (!select || select.dataset.enhanced) return; select.dataset.enhanced = 'seg';
    var group = document.createElement('div'); group.className = 'seg'; group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', labelText(select));
    var thumb = document.createElement('span'); thumb.className = 'seg-thumb'; thumb.setAttribute('aria-hidden', 'true'); group.appendChild(thumb);
    var buttons = [];
    function build(){
      buttons.forEach(function(b){ b.remove(); }); buttons = [];
      Array.prototype.forEach.call(select.options, function(option){
        var b = document.createElement('button'); b.type = 'button'; b.className = 'seg-btn'; b.setAttribute('role', 'radio');
        b.textContent = option.textContent; b.dataset.value = option.value; group.appendChild(b); buttons.push(b);
        b.addEventListener('click', function(){ choose(option.value); });
        b.addEventListener('keydown', function(event){
          var step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
          if (!step) return; event.preventDefault();
          var i = buttons.indexOf(b);
          for (var k = 1; k <= buttons.length; k++) {
            var next = ((i + step * k) % buttons.length + buttons.length) % buttons.length;
            if (!buttons[next].disabled) { choose(buttons[next].dataset.value); buttons[next].focus(); return; }
          }
        });
      });
      group.style.setProperty('--n', buttons.length);
    }
    function sync(){
      if (buttons.length !== select.options.length || Array.prototype.some.call(select.options, function(o, i){ return buttons[i].dataset.value !== o.value || buttons[i].textContent !== o.textContent; })) build();
      var current = valueDesc.get.call(select), index = 0;
      Array.prototype.forEach.call(select.options, function(o, i){ if (o.value === current) index = i; });
      group.style.setProperty('--i', index);
      buttons.forEach(function(b, i){
        b.setAttribute('aria-checked', String(i === index)); b.tabIndex = i === index ? 0 : -1;
        b.disabled = select.disabled || select.options[i].disabled;
      });
      group.classList.toggle('is-disabled', select.disabled);
    }
    function choose(value){
      if (valueDesc.get.call(select) === value) return;
      valueDesc.set.call(select, value); sync(); fire(select);
    }
    hideSource(select); keepFocusInside(group); select.parentNode.insertBefore(group, select.nextSibling);
    build(); watch(select, sync); sync();
  }

  /* ---------- выпадающий список ---------- */
  function closeList(){
    if (!openList) return;
    var l = openList; openList = null;
    l.root.classList.remove('is-open'); l.btn.setAttribute('aria-expanded', 'false'); l.list.classList.add('hidden');
    document.removeEventListener('pointerdown', l.outside, true);
  }
  function dropdown(select){
    if (!select || select.dataset.enhanced) return; select.dataset.enhanced = 'dd';
    var root = document.createElement('div'); root.className = 'dd';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    var text = document.createElement('span'); text.className = 'dd-text'; btn.appendChild(text);
    var chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); chev.setAttribute('viewBox', '0 0 14 9'); chev.setAttribute('class', 'dd-chev'); chev.setAttribute('aria-hidden', 'true');
    chev.innerHTML = '<path d="M1 1.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
    btn.appendChild(chev);
    var list = document.createElement('div'); list.className = 'dd-list hidden'; list.setAttribute('role', 'listbox'); list.tabIndex = -1;
    root.append(btn, list);
    var items = [], active = -1, typed = '', typedAt = 0;

    function build(){
      list.replaceChildren(); items = [];
      Array.prototype.forEach.call(select.options, function(option){
        var item = document.createElement('div'); item.className = 'dd-opt'; item.setAttribute('role', 'option'); item.dataset.value = option.value;
        var label = document.createElement('span'); label.textContent = option.textContent; item.appendChild(label);
        if (option.disabled) item.setAttribute('aria-disabled', 'true');
        item.addEventListener('pointerenter', function(){ if (!option.disabled) setActive(items.indexOf(item)); });
        item.addEventListener('click', function(){ if (!option.disabled) pick(option.value); });
        list.appendChild(item); items.push(item);
      });
    }
    function sync(){
      if (items.length !== select.options.length || Array.prototype.some.call(select.options, function(o, i){ return items[i].dataset.value !== o.value || items[i].textContent !== o.textContent; })) build();
      var current = valueDesc.get.call(select), shown = select.options.length ? select.options[0].textContent : '';
      Array.prototype.forEach.call(select.options, function(o, i){
        var on = o.value === current; items[i].setAttribute('aria-selected', String(on));
        items[i].classList.toggle('is-selected', on); if (on) shown = o.textContent;
      });
      text.textContent = shown; btn.disabled = select.disabled; root.classList.toggle('is-disabled', select.disabled);
      if (select.disabled) closeList();
    }
    function setActive(i){
      if (i < 0 || i >= items.length) return; active = i;
      items.forEach(function(item, k){ item.classList.toggle('is-active', k === i); });
      if (items[i].scrollIntoView) items[i].scrollIntoView({ block:'nearest' });
    }
    function pick(value){
      closeList(); btn.focus();
      if (valueDesc.get.call(select) !== value) { valueDesc.set.call(select, value); sync(); fire(select); }
    }
    function open(){
      if (select.disabled) return; closeList();
      list.classList.remove('hidden'); root.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
      var rect = btn.getBoundingClientRect(), room = window.innerHeight - rect.bottom - 110;
      root.classList.toggle('is-up', room < 220 && rect.top > room);
      var current = valueDesc.get.call(select), start = 0;
      items.forEach(function(item, i){ if (item.dataset.value === current) start = i; });
      setActive(start);
      var outside = function(event){ if (!root.contains(event.target)) closeList(); };
      document.addEventListener('pointerdown', outside, true);
      openList = { root:root, btn:btn, list:list, outside:outside };
    }
    function move(step){
      var i = active;
      for (var k = 0; k < items.length; k++) {
        i = ((i + step) % items.length + items.length) % items.length;
        if (items[i].getAttribute('aria-disabled') !== 'true') { setActive(i); return; }
      }
    }
    btn.addEventListener('click', function(){ if (openList && openList.root === root) closeList(); else open(); });
    btn.addEventListener('keydown', function(event){
      var isOpen = !!openList && openList.root === root, k = event.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') { event.preventDefault(); if (!isOpen) open(); else move(k === 'ArrowDown' ? 1 : -1); }
      else if (k === 'Home' && isOpen) { event.preventDefault(); setActive(0); }
      else if (k === 'End' && isOpen) { event.preventDefault(); setActive(items.length - 1); }
      else if ((k === 'Enter' || k === ' ') && isOpen) { event.preventDefault(); var o = select.options[active]; if (o && !o.disabled) pick(o.value); }
      else if (k === 'Escape' && isOpen) { event.preventDefault(); closeList(); }
      else if (k === 'Tab' && isOpen) closeList();
      else if (k.length === 1 && !event.ctrlKey && !event.metaKey && k !== ' ') {
        var now = Date.now(); typed = (now - typedAt < 700 ? typed : '') + k.toLowerCase(); typedAt = now;
        for (var i = 0; i < items.length; i++) if (items[i].textContent.toLowerCase().indexOf(typed) === 0) { if (!isOpen) open(); setActive(i); break; }
      }
    });
    hideSource(select); keepFocusInside(root); select.parentNode.insertBefore(root, select.nextSibling);
    build(); watch(select, sync); sync();
  }

  ['publicationKind', 'catalogPriceMode'].forEach(function(id){ segmented(document.getElementById(id)); });
  ['publicationProduct', 'catalogNutritionBasis'].forEach(function(id){ dropdown(document.getElementById(id)); });
})();
