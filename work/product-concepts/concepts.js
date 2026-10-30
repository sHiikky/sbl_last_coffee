(() => {
  'use strict';
  const BASE_PRICE = 280;
  const PHOTO = 'assets/ice-latte.webp';
  const variants = [
    { id:'a', letter:'А', title:'Молочный компакт', subtitle:'Воздух, ясность и быстрый выбор', theme:'milk', description:'Небольшое фото рядом с названием. Сразу видно состав и настройки — самый компактный и спокойный вариант.' },
    { id:'b', letter:'Б', title:'Янтарное стекло', subtitle:'Тёплый свет и прозрачные слои', theme:'amber', description:'Кофейный янтарь, свет за стаканом и полупрозрачные добавки. Ближе всего к настроению твоих референсов Drinkit.' },
    { id:'c', letter:'В', title:'Сатиновый свет', subtitle:'Серебро, молочный фон, фирменный спектр', theme:'satin', description:'Асимметричная сцена и небольшое фото под углом. Серебро продолжает стиль выбранной карты SBL; настройки остаются светлыми.' },
    { id:'d', letter:'Г', title:'Ночной кофе', subtitle:'Графит и мягкое янтарное свечение', theme:'night', description:'Тёмная студия, маленький стакан и тонкая подсветка. Более выразительное настроение карточки на фоне привычного светлого меню.' },
  ];
  // Actual additions and prices from the public catalog snapshot, 29 October.
  // This is a local interaction demo: there is no checkout or network transport.
  const additions = [
    { id:'syrup', title:'Сироп', detail:'10 мл', price:30, material:'syrup' },
    { id:'milk', title:'Молоко', detail:'50 мл', price:25, material:'milk' },
    { id:'alternative', title:'Альт. молоко', detail:'100 мл', price:60, material:'alternative' },
  ];
  const states = new Map();
  const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
  const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 4.8a5 5 0 0 0-7.1 0L12 5.9l-1.1-1.1a5 5 0 0 0-7.1 7.1L12 20l8.2-8.1a5 5 0 0 0 0-7.1Z"/></svg>';
  const close = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const logo = '<svg viewBox="113 191 1554 452" aria-hidden="true"><image href="/brand-assets/brand/sbl-restored-full.png" width="1774" height="887"/></svg>';
  let selected = '';
  try { selected = localStorage.getItem('sbl-product-concept-choice-v1') || ''; } catch (_) {}
  const gallery = document.getElementById('gallery');
  for (const variant of variants) {
    const section = document.createElement('section');
    section.className = 'concept'; section.id = 'concept-' + variant.id;
    section.setAttribute('aria-labelledby', 'title-' + variant.id);
    section.innerHTML = `
      <div class="concept-label"><span class="letter">${variant.letter}</span><div><h2 id="title-${variant.id}">${variant.title}</h2><p>${variant.subtitle}</p></div></div>
      <div class="phone ${variant.theme}" data-open>
        <div class="menu-background"><div class="menu-bar">${logo}<small>11:00–20:00</small></div><h3>Время для кофе</h3><div class="menu-tabs"><span>Все</span><span>Кофе</span><span>Авторский кофе</span></div><div class="menu-grid">
          <button type="button" class="menu-tile" data-open-sheet aria-label="Открыть карточку Айс Латте"><img src="${PHOTO}" alt=""><strong>Айс Латте</strong><small>280 ₽ &nbsp; ↗</small></button>
          <div class="menu-tile"><img src="assets/orange-punch.webp" alt=""><strong>Апельсиновый пунш</strong><small>360 ₽</small></div>
        </div></div>
        <div class="menu-bottom" aria-hidden="true"><span>Главная</span><b>Меню</b><span>Корзина</span><span>Профиль</span></div>
        <button type="button" class="scrim" aria-label="Закрыть карточку напитка" data-close-sheet tabindex="-1"></button>
        <section class="sheet" role="region" aria-label="Карточка Айс Латте, вариант ${variant.letter}">
          <div class="sheet-head"><button type="button" class="handle" aria-label="Свернуть карточку напитка" data-handle></button><button type="button" class="close" data-close-sheet aria-label="Закрыть карточку напитка">${close}</button></div>
          <div class="sheet-scroll"><div class="sheet-inner">
            <div class="hero"><div class="hero-copy"><p class="eyebrow">SBL · Кофе со льдом</p><h3>Айс Латте</h3><p class="description">Кофейное зерно, молоко 3,2%, лёд, сироп.</p></div><img class="product-photo" src="${PHOTO}" alt="Айс Латте SBL в прозрачном стакане" draggable="false"><button type="button" class="favorite" aria-label="Добавить в избранное в примере" aria-pressed="false">${heart}</button></div>
            ${variant.id==='a'?'<div class="micro-line">Настрой под свой вкус</div>':''}
            <div class="section-title"><strong>Добавить к напитку</strong><span>на одну порцию</span></div>
            <div class="addition-list" role="group" aria-label="Добавки к Айс Латте">${additions.map(a=>`<button type="button" class="addition" data-addition="${a.id}" aria-pressed="false" aria-label="${a.title}, ${a.detail}, плюс ${a.price} рублей"><span class="ingredient ${a.material}" aria-hidden="true"></span><span class="add-sign" aria-hidden="true">+</span><b>${a.title}</b><small>${a.detail} · +${a.price} ₽</small></button>`).join('')}</div>
            <p class="selected-copy" aria-live="polite">Без дополнительных добавок</p>
            <details class="comment"><summary>Пожелание бариста</summary><label class="sr-only" for="note-${variant.id}">Пожелание к напитку</label><textarea id="note-${variant.id}" placeholder="Например, вкус выбранного сиропа" maxlength="300"></textarea><p>Пожелание не меняет цену. Платные добавки выбирай выше.</p></details>
          </div></div>
          <footer class="action-bar"><div class="quantity" role="group" aria-label="Количество напитков"><button type="button" data-quantity="-1" aria-label="Уменьшить количество" disabled>−</button><output aria-label="Количество">1</output><button type="button" data-quantity="1" aria-label="Увеличить количество">+</button></div><button type="button" class="cta" aria-label="Добавить в пример, 280 рублей"><span>Добавить</span><span aria-hidden="true">·</span><span class="price">280 ₽</span></button></footer>
          <div class="home-indicator" aria-hidden="true"></div>
        </section><div class="toast" role="status" aria-live="polite"></div>
      </div>
      <div class="concept-actions"><button type="button" class="choose" data-choice="${variant.id}" aria-pressed="false">Выбрать ${variant.letter}</button><button type="button" class="replay">Открыть ещё раз ↗</button></div>
      <p class="concept-description">${variant.description}</p>`;
    gallery.append(section);
    const phone = section.querySelector('.phone');
    const sheet = section.querySelector('.sheet');
    const state = { quantity:1, additions:new Set(), timer:null, animationTimer:null, open:true };
    states.set(variant.id, state);
    const setOpen = (open, restoreFocus = true) => {
      state.open = open;
      phone.toggleAttribute('data-open', open);
      sheet.inert = !open;
      section.querySelector('.menu-background').inert = open;
      sheet.setAttribute('aria-hidden', String(!open));
      if (restoreFocus) (open ? section.querySelector('.handle') : section.querySelector('[data-open-sheet]')).focus({preventScroll:true});
    };
    section.querySelectorAll('[data-close-sheet]').forEach(b=>b.addEventListener('click',()=>setOpen(false)));
    section.querySelector('[data-open-sheet]').addEventListener('click',()=>setOpen(true));
    section.querySelector('.replay').addEventListener('click',()=>{
      clearTimeout(state.animationTimer); setOpen(false,false);
      section.querySelector('.sheet-scroll').scrollTop=0;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      state.animationTimer = setTimeout(()=>setOpen(true,false),reduce?0:420);
    });
    const refresh = () => {
      const extra = additions.filter(a=>state.additions.has(a.id)).reduce((sum,a)=>sum+a.price,0);
      const total = (BASE_PRICE+extra)*state.quantity;
      section.querySelector('.quantity output').value=String(state.quantity);
      section.querySelector('[data-quantity="-1"]').disabled=state.quantity===1;
      section.querySelector('[data-quantity="1"]').disabled=state.quantity===9;
      section.querySelector('.price').textContent=money(total);
      section.querySelector('.cta').setAttribute('aria-label',`Добавить ${state.quantity} в пример, ${total} рублей`);
      section.querySelector('.selected-copy').textContent=extra?`Добавки: +${extra} ₽ на порцию`:'Без дополнительных добавок';
      section.querySelectorAll('[data-addition]').forEach(button=>{
        const on=state.additions.has(button.dataset.addition);
        button.setAttribute('aria-pressed',String(on)); button.querySelector('.add-sign').textContent=on?'✓':'+';
      });
    };
    section.querySelectorAll('[data-quantity]').forEach(button=>button.addEventListener('click',()=>{state.quantity=Math.max(1,Math.min(9,state.quantity+Number(button.dataset.quantity)));refresh();}));
    section.querySelectorAll('[data-addition]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.addition;state.additions.has(id)?state.additions.delete(id):state.additions.add(id);refresh();}));
    section.querySelector('.favorite').addEventListener('click',event=>{const b=event.currentTarget;const on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',on?'Убрать из избранного в примере':'Добавить в избранное в примере');});
    section.querySelector('.cta').addEventListener('click',()=>{
      const toast=section.querySelector('.toast'); clearTimeout(state.timer);
      toast.textContent=`В примере: ${state.quantity} ${state.quantity===1?'напиток':state.quantity<5?'напитка':'напитков'}, ${section.querySelector('.price').textContent}. Корзина приложения не меняется.`;
      toast.setAttribute('data-visible',''); state.timer=setTimeout(()=>toast.removeAttribute('data-visible'),3200);
    });
    const handle=section.querySelector('.handle'); let start=null, moved=false;
    handle.addEventListener('pointerdown',event=>{start=event.clientY;moved=false;sheet.style.transition='none';handle.setPointerCapture(event.pointerId);});
    handle.addEventListener('pointermove',event=>{if(start===null)return;const dy=event.clientY-start;if(Math.abs(dy)>10)moved=true;sheet.style.transform=`translateY(${Math.min(240,Math.max(0,dy))}px)`;});
    handle.addEventListener('pointerup',event=>{sheet.style.transition='';sheet.style.transform='';if(start!==null&&event.clientY-start>70)setOpen(false);start=null;});
    handle.addEventListener('pointercancel',()=>{start=null;sheet.style.transition='';sheet.style.transform='';});
    handle.addEventListener('click',()=>{if(!moved)setOpen(false);moved=false;});
    phone.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.open){event.preventDefault();setOpen(false);}});
    section.querySelector('.choose').addEventListener('click',()=>{
      selected=variant.id;try{localStorage.setItem('sbl-product-concept-choice-v1',selected);}catch(_){}
      updateChoice();
    });
    setOpen(true,false);
  }
  function updateChoice(){
    document.querySelectorAll('[data-choice]').forEach(button=>{const on=button.dataset.choice===selected;button.setAttribute('aria-pressed',String(on));const v=variants.find(v=>v.id===button.dataset.choice);button.textContent=on?`Выбрано: ${v.letter}`:`Выбрать ${v.letter}`;});
    const v=variants.find(v=>v.id===selected);
    if(v)document.getElementById('selection-message').textContent=`Выбран ${v.letter} — «${v.title}». Напиши эту букву в чат; можно добавить пожелания к деталям.`;
  }
  updateChoice();
})();
