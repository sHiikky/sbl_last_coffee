'use strict';
const cards = [...document.querySelectorAll('.card')];
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const timers = new Map();
const animations = new Map();

function playShine(card) {
  if (motion.matches || document.hidden) return;
  const shine = card.querySelector('.shine');
  if (!shine?.animate) return;
  animations.get(card)?.cancel();
  const animation = shine.animate([
    { transform: 'translateX(-120%) skewX(-20deg)', opacity: 0 },
    { offset: .13, opacity: .75 },
    { offset: .84, opacity: .75 },
    { transform: 'translateX(850%) skewX(-20deg)', opacity: 0 },
  ], { duration: 3000, easing: 'ease-in-out', fill: 'none' });
  animations.set(card, animation);
  animation.onfinish = () => { if (animations.get(card) === animation) animations.delete(card); };
}

function stopShines() {
  for (const timer of timers.values()) clearTimeout(timer);
  for (const animation of animations.values()) animation.cancel();
  timers.clear(); animations.clear();
}

function schedule(card, delay) {
  const timer = setTimeout(() => {
    timers.delete(card);
    if (motion.matches || document.hidden) return;
    playShine(card);
    schedule(card, Number(card.dataset.period));
  }, delay);
  timers.set(card, timer);
}

function syncMotion() {
  stopShines();
  document.querySelectorAll('[data-replay],[data-replay-all]').forEach(button => { button.disabled = motion.matches; });
  document.getElementById('motion-status').textContent = motion.matches
    ? 'На устройстве включено уменьшение движения — карты показаны без анимации.'
    : 'На каждой карте — один мягкий блик на 3 секунды, с паузой около 20 секунд.';
  if (!motion.matches && !document.hidden) cards.forEach((card, index) => schedule(card, 1500 + index * 160));
}

document.querySelectorAll('[data-replay]').forEach(button => button.addEventListener('click', () => {
  const card = button.closest('.option').querySelector('.card');
  clearTimeout(timers.get(card)); timers.delete(card);
  playShine(card);
  if (!motion.matches && !document.hidden) schedule(card, Number(card.dataset.period));
}));
document.querySelector('[data-replay-all]').addEventListener('click', () => {
  for (const card of cards) {
    clearTimeout(timers.get(card)); timers.delete(card);
    playShine(card);
    if (!motion.matches && !document.hidden) schedule(card, Number(card.dataset.period));
  }
});

document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => {
  const demo = button.dataset.demo === 'balance';
  document.querySelectorAll('[data-demo]').forEach(toggle => toggle.setAttribute('aria-pressed', String(toggle === button)));
  document.querySelectorAll('[data-balance]').forEach(label => { label.textContent = demo ? '1 280' : '0'; });
  document.querySelectorAll('[data-next]').forEach(label => { label.textContent = demo ? '8 720 ₽ до 2 уровня' : '10 000 ₽ до 2 уровня'; });
  document.querySelectorAll('[data-progress]').forEach(fill => { fill.style.width = demo ? '12.8%' : '0%'; });
  for (const card of cards) {
    const name = card.closest('.option').querySelector('h2').textContent;
    const letter = card.closest('.option').dataset.option;
    card.setAttribute('aria-label', `Вариант ${letter}. ${name}. ${demo ? 'Условный пример: 1 280' : '0'} бонусов. Кэшбэк 5 процентов. Уровень 1. ${demo ? '8 720' : '10 000'} рублей до второго уровня.`);
  }
}));

document.querySelectorAll('[data-choose]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-choose]').forEach(choice => {
    const chosen = choice === button;
    choice.setAttribute('aria-pressed', String(chosen));
    choice.closest('.option').dataset.selected = String(chosen);
    choice.textContent = chosen ? `Выбрано: ${choice.dataset.choose}` : `Выбрать ${choice.dataset.choose}`;
  });
  const name = button.closest('.option').querySelector('h2').textContent;
  document.getElementById('selection-status').textContent = `Выбран вариант ${button.dataset.choose} — ${name}. Напиши эту букву в чат; можно добавить пожелания к деталям.`;
}));

motion.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', syncMotion);
window.addEventListener('pagehide', stopShines);
syncMotion();
