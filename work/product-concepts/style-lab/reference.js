const directions = [
  { id: 'onest600', weight: 600, label: '1 / Onest 600', note: 'Мой выбор: спокойные цены, которые сочетаются с лёгкими названиями.' },
  { id: 'onest700', weight: 700, label: '2 / Onest 700', note: 'Чуть выразительнее: то же семейство, но цены заметнее на карточке.' },
];
const root = document.getElementById('reference-grid');
root.innerHTML = directions.map(d => `
  <article class="reference-option" id="${d.id}" data-id="${d.id}">
    <header><h2>${d.label}</h2><p>${d.note}</p></header>
    <div class="phone reference-phone" style="--price-weight:${d.weight}">
      <h2 class="page-title">Меню</h2>
      <div class="reference-categories"><span>Все</span><span>Кофе</span><span>Авторский кофе</span></div>
      <div class="product-grid">
        <div class="product-tile surface">
          <img src="../assets/ice-latte.webp" alt="Айс Латте">
          <b>Айс Латте</b>
          <div><strong class="num">280 ₽</strong><svg class="ref-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></div>
        </div>
        <div class="product-tile surface">
          <img src="../assets/orange-punch.webp" alt="Апельсиновый пунш">
          <b>Апельсиновый пунш</b>
          <div><strong class="num">360 ₽</strong><svg class="ref-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></div>
        </div>
      </div>
      <div class="reference-phrase"><small>Один шрифт, разная выразительность</small><p>Названия — Onest 400<br>Цены — Onest ${d.weight}</p></div>
      <div class="reference-tabs"><span>Главная</span><b>Меню</b><span>Корзина</span><span>Профиль</span></div>
    </div>
    <button type="button" class="reference-select" data-select="${d.id}" aria-pressed="false">Сравнить цены Onest ${d.weight}</button>
  </article>
`).join('');
let selected = null;
const control = document.getElementById('reference-size');
function apply() {
  const size = Number(control.value);
  document.querySelectorAll('.reference-phone').forEach(e => {
    e.style.setProperty('--product-size', `${size}px`);
    e.style.setProperty('--product-line', `${size + 5}px`);
    e.style.setProperty('--product-title-height', `${(size + 5) * 2}px`);
  });
  document.querySelectorAll('[data-select]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.select === selected)));
  const chosen = directions.find(d => d.id === selected);
  document.getElementById('reference-choice').textContent = chosen
    ? `Для сравнения: названия Onest 400, ${size} px · цены Onest ${chosen.weight}, 16 px · Светлый минерал. Выбор цифр пока не утверждён.`
    : `Onest для текста выбран. Названия — ${size} px. Для цен рекомендую первый вариант: Onest 600.`;
}
control.addEventListener('change', apply);
root.addEventListener('click', e => {
  const button = e.target.closest('[data-select]');
  if (button) { selected = button.dataset.select; apply(); }
});
apply();
Promise.all([400, 600, 700].map(weight => document.fonts.load(`${weight} 16px "Onest"`, 'Айс Латте 280 ₽')))
  .then(faces => {
    document.getElementById('reference-status').textContent = faces.every(f => f.length)
      ? 'Onest загружен. Названия — 400, цены — 600 или 700. Все цены и фото прежние.'
      : 'Шрифт не загрузился — обнови страницу.';
  })
  .catch(() => { document.getElementById('reference-status').textContent = 'Не удалось загрузить шрифт. Обнови страницу.'; });