import { derivePhotoPalette } from './photo-palette.js';
import { HOLOGRAPHIC_BASE, HOLOGRAPHIC_SPECTRUM, HOLOGRAPHIC_STOPS, HOLOGRAPHIC_HIGHLIGHT, HOLOGRAPHIC_DURATION } from './checkout-holographic-tokens.js';

(() => {
  'use strict';
  const drinks=[
    {id:'latte',name:'Айс Латте',short:'Айс Латте',price:280,image:'ice-latte.webp',description:'Кофейное зерно, молоко 3,2%, лёд, сироп.',region:[.2,.18,.6,.6],fallback:32,label:'Кофейный янтарь'},
    {id:'matcha',name:'Матча латте',short:'Матча',price:250,image:'matcha.webp',description:'Зелёный матча и молоко.',region:[.13,.05,.74,.16],fallback:98,toneRange:[94,125],label:'Зелёный матча'},
    {id:'berry',name:'Чай Малина–Розмарин',short:'Малина',price:320,image:'raspberry.webp',description:'Ягодный чай с малиной и розмарином · 500 мл.',region:[.15,.3,.5,.45],fallback:8,label:'Ягодный свет'},
    {id:'ube',name:'Убе Латте',short:'Убе',price:250,image:'ube.webp',description:'Нежный фиолетовый убе и молоко.',region:[.13,.05,.74,.16],fallback:285,toneRange:[272,290],label:'Лавандовый убе'},
    {id:'blue',name:'Матча Blue Sbleskom',short:'Blue',price:250,image:'blue.webp',description:'Голубой матча SBL на молоке.',region:[.13,.05,.74,.16],fallback:198,label:'Голубой матча'},
  ];
  const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
  const phone=$('#phone'),sheet=$('#sheet'),picker=$('#drink-picker');
  // Exact tokens/stops and geometry of the app's HolographicSurface, not a
  // different rainbow stripe. This copy is checked against theme/holographic.js.
  const gradient=(colors,stops)=>`linear-gradient(90deg,${colors.map((c,i)=>`${c} ${stops[i]*100}%`).join(',')})`;
  const button=$('#add');
  button.style.setProperty('--holo-base',gradient(HOLOGRAPHIC_BASE,[0,.18,.45,.72,1]));
  button.style.setProperty('--holo-spectrum',gradient(HOLOGRAPHIC_SPECTRUM,HOLOGRAPHIC_STOPS));
  button.style.setProperty('--holo-highlight',gradient(HOLOGRAPHIC_HIGHLIGHT,[0,.14,.34,.5,.68,.84,1]));
  button.style.setProperty('--holo-duration',HOLOGRAPHIC_DURATION+'ms');
  const measureHolo=()=>button.style.setProperty('--holo-travel',button.clientWidth*1.35+'px');
  const holoResize=new ResizeObserver(measureHolo);holoResize.observe(button);measureHolo();
  const prices={syrup:30,milk:25,alternative:60},states=new Map(drinks.map(d=>[d.id,{qty:1,additions:new Set(),note:'',favorite:false}]));
  let active=drinks[0],revision=0,toastTimer,replayTimer;
  const state=()=>states.get(active.id);
  const amount=()=> (active.price+[...state().additions].reduce((sum,id)=>sum+prices[id],0))*state().qty;
  function refresh(){
    const s=state(); $('.quantity output').value=String(s.qty);
    $('[data-quantity="-1"]').disabled=s.qty===1;$('[data-quantity="1"]').disabled=s.qty===9;
    $('.price').textContent=money(amount());$('#add').setAttribute('aria-label',`Добавить ${s.qty} в пример за ${amount()} рублей`);
    document.querySelectorAll('[data-addition]').forEach(b=>{const on=s.additions.has(b.dataset.addition);b.setAttribute('aria-pressed',String(on));b.querySelector('.add-sign').textContent=on?'✓':'+';});
    const extra=[...s.additions].reduce((sum,id)=>sum+prices[id],0);
    $('.selected-copy').textContent=extra?`Добавки: +${extra} ₽ на порцию`:'Без дополнительных добавок';
    $('.favorite').setAttribute('aria-pressed',String(s.favorite));$('#note').value=s.note;
  }
  // Use the liquid region, excluding a white floor/metallic cup and low-alpha
  // pixels. The hue comes from the actual photo, brightness is art-directed
  // for readable light text; no photo pixels are modified or uploaded.
  function photoPalette(image,drink){
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});const [x,y,w,h]=drink.region;
    ctx.drawImage(image,x*image.naturalWidth,y*image.naturalHeight,w*image.naturalWidth,h*image.naturalHeight,0,0,64,64);
    return derivePhotoPalette(ctx.getImageData(0,0,64,64).data,drink);
  }
  async function showDrink(drink){
    const ownRevision=++revision;sheet.setAttribute('data-loading','');
    document.querySelectorAll('[data-drink]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.drink===drink.id)));
    try{
      const image=new Image();image.src='assets/'+drink.image;await image.decode();if(ownRevision!==revision)return;
      let palette={hue:drink.fallback,saturation:34};try{palette=photoPalette(image,drink);}catch(_){}
      active=drink;phone.style.setProperty('--h',palette.hue.toFixed(1));phone.style.setProperty('--s',palette.saturation.toFixed(1)+'%');
      const photo=$('#drink-photo');photo.src=image.src;photo.alt=drink.name;photo.dataset.cutout=drink.id==='latte'?'latte':'none';
      $('#drink-name').textContent=drink.name;$('#drink-description').textContent=drink.description;sheet.setAttribute('aria-label','Карточка '+drink.name);
      $('#open-sheet img').src=image.src;$('#open-sheet strong').textContent=drink.name;$('#open-sheet small').textContent=money(drink.price)+' ↗';
      $('#palette-caption').textContent=drink.label+' · палитра напитка';
      $('.sheet-scroll').scrollTop=0;$('.toast').removeAttribute('data-visible');clearTimeout(toastTimer);refresh();
    }catch(_){if(ownRevision!==revision)return;$('#palette-caption').textContent='Фото не загрузилось. Выбери напиток ещё раз.';document.querySelectorAll('[data-drink]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.drink===active.id)));}
    finally{if(ownRevision===revision)sheet.removeAttribute('data-loading');}
  }
  for(const drink of drinks){const b=document.createElement('button');b.type='button';b.className='drink-option';b.dataset.drink=drink.id;b.setAttribute('aria-pressed',String(drink.id===active.id));b.style.setProperty('--dot',`hsl(${drink.fallback} 45% 42%)`);b.innerHTML=`<img src="assets/${drink.image}" alt=""><span>${drink.short}</span><i aria-hidden="true"></i>`;b.addEventListener('click',()=>showDrink(drink));picker.append(b);}
  document.querySelectorAll('[data-addition]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.addition,s=state();s.additions.has(id)?s.additions.delete(id):s.additions.add(id);refresh();}));
  document.querySelectorAll('[data-quantity]').forEach(b=>b.addEventListener('click',()=>{state().qty=Math.max(1,Math.min(9,state().qty+Number(b.dataset.quantity)));refresh();}));
  $('#note').addEventListener('input',e=>{state().note=e.target.value;});$('.favorite').addEventListener('click',()=>{state().favorite=!state().favorite;refresh();});
  $('#add').addEventListener('click',()=>{const toast=$('.toast');toast.textContent=`В примере: ${active.name}, ${state().qty} шт. · ${money(amount())}. Корзина приложения не меняется.`;toast.setAttribute('data-visible','');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.removeAttribute('data-visible'),3200);});
  function setOpen(open,focus=true){phone.toggleAttribute('data-open',open);sheet.inert=!open;sheet.setAttribute('aria-hidden',String(!open));$('.menu-background').inert=open;if(focus)(open?$('#handle'):$('#open-sheet')).focus({preventScroll:true});}
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>setOpen(false)));$('#open-sheet').addEventListener('click',()=>setOpen(true));
  $('#replay').addEventListener('click',()=>{clearTimeout(replayTimer);setOpen(false,false);$('.sheet-scroll').scrollTop=0;replayTimer=setTimeout(()=>setOpen(true,false),matchMedia('(prefers-reduced-motion: reduce)').matches?0:420);});
  phone.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);}});
  let start=null,moved=false;const handle=$('#handle');
  handle.addEventListener('pointerdown',e=>{start=e.clientY;moved=false;sheet.style.transition='none';handle.setPointerCapture(e.pointerId);});
  handle.addEventListener('pointermove',e=>{if(start===null)return;const dy=e.clientY-start;if(Math.abs(dy)>10)moved=true;sheet.style.transform=`translateY(${Math.min(240,Math.max(0,dy))}px)`;});
  handle.addEventListener('pointerup',e=>{sheet.style.transition='';sheet.style.transform='';if(start!==null&&e.clientY-start>70)setOpen(false);start=null;});
  handle.addEventListener('pointercancel',()=>{start=null;sheet.style.transition='';sheet.style.transform='';});handle.addEventListener('click',()=>{if(!moved)setOpen(false);moved=false;});
  document.addEventListener('visibilitychange',()=>document.body.toggleAttribute('data-paused',document.hidden));
  setOpen(true,false);showDrink(active);
})();
