const fonts=[
 {id:'nunito',name:'Nunito',family:'Nunito',note:'Мягкие округлые окончания. Мой первый кандидат для SBL.',max:700},
 {id:'mplusrounded1c',name:'M PLUS Rounded 1c',family:'M PLUS Rounded 1c',note:'Заметно скруглённые штрихи. Спокойный и аккуратный.',max:700},
 {id:'zenmarugothic',name:'Zen Maru Gothic',family:'Zen Maru Gothic',note:'Тёплый, округлый, немного необычная кириллица.',max:700},
 {id:'comfortaa',name:'Comfortaa',family:'Comfortaa',note:'Круглая геометрия. Самый выраженный рисунок окружностей.',max:700},
 {id:'jura',name:'Jura',family:'Jura',note:'Скруглённые углы и более прямоугольная форма. Техничнее остальных.',max:700},
 {id:'balsamiqsans',name:'Balsamiq Sans',family:'Balsamiq Sans',note:'Округлый рукописный характер. Более игровой эксперимент.',max:700},
 {id:'nunitosans',name:'Nunito Sans · раньше',family:'Nunito Sans',note:'Для сравнения: прежний вариант. Nunito выше — другое семейство.',max:1000},
 {id:'system',name:'Системный · сейчас',family:'system-ui',note:'Текущий системный шрифт для сравнения.',max:900},
];
const numberFonts=[
 {id:'system',name:'Системный · сейчас',family:'system-ui',max:900},
 {id:'manrope',name:'Manrope',family:'Manrope',note:'Собранный и выразительный. Мой первый вариант для SBL.',max:800},
 {id:'golostext',name:'Golos Text',family:'Golos Text',note:'Спокойный, ясный, с уверенной кириллицей. Хорош для всего интерфейса.',max:900},
 {id:'onest',name:'Onest',family:'Onest',note:'Мягкая геометрия без детскости. Хорошо связывает кофе и серебро.',max:900},
 {id:'inter',name:'Inter',family:'Inter',note:'Точный и нейтральный. Самый сдержанный вариант.',max:900},
 {id:'nunitosans',name:'Nunito Sans',family:'Nunito Sans',note:'Более дружелюбный и округлый. Тёплое настроение кофейни.',max:1000},
 {id:'rubik',name:'Rubik',family:'Rubik',note:'Плотный и слегка скруглённый. Выразительные цифры.',max:900},
 {id:'montserrat',name:'Montserrat',family:'Montserrat',note:'Шире и заметнее. Красиво в заголовках; длинным названиям теснее.',max:900},
 {id:'ibmplexsans',name:'IBM Plex Sans',family:'IBM Plex Sans',note:'Более характерный и редакционный. Другой рисунок цифр.',max:700},
];
const palettes=[
 {id:'current',name:'Текущая',tag:'Точка отсчёта',bg:'#ECEAE5',surface:'#FFFFFF',ink:'#0C0C0C',secondary:'#67645E',action:'#E8500A',soft:'#E7E5DF',note:'Текущие основные цвета. Яркий оранжевый и холодноватый серо-бежевый фон. Белый мелкий текст на оранжевом требует усиления контраста.'},
 {id:'porcelain',name:'Тёплый фарфор',tag:'Более тёплая альтернатива',bg:'#F2EEE7',surface:'#FFFDFA',ink:'#242320',secondary:'#68645F',action:'#C74717',soft:'#E7DED0',note:'Чуть светлее и теплее фон, мягкий белый, глубокий оранжевый. Серебряная карта остаётся прохладным акцентом, а стекло — цветным.'},
 {id:'mineral',name:'Светлый минерал',tag:'Твой выбор',bg:'#EFF0ED',surface:'#FDFEFC',ink:'#202320',secondary:'#62675E',action:'#B74924',soft:'#DDE2D8',note:'Выбранная тобой основа: светлый минерал, мягкий белый и глубокий оранжевый. Цифры — Golos Text, 800. Теперь сравниваем округлый текст.'},
 {id:'latte',name:'Латте и медь',tag:'Глубже и уютнее',bg:'#EEE7DE',surface:'#FBF7F0',ink:'#302820',secondary:'#6E6257',action:'#AA4E2C',soft:'#E1D2C1',note:'Более тёплая кофейная основа и медный акцент. Камерный характер; белые участки фотографий заметнее на сливочных поверхностях.'},
];
const byId=id=>document.getElementById(id);
const state={font:'nunito',numbers:'golostext',weight:800,palette:'mineral',tabular:true};
const storageKey='sbl-style-lab-v2-rounded';
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved){if(fonts.some(f=>f.id===saved.font))state.font=saved.font;if(saved.numbers==='same'||numberFonts.some(f=>f.id===saved.numbers))state.numbers=saved.numbers;if([700,800,900].includes(saved.weight))state.weight=saved.weight;if(palettes.some(p=>p.id===saved.palette))state.palette=saved.palette;if(typeof saved.tabular==='boolean')state.tabular=saved.tabular;}}catch{}
const icons=['home','coffee','bag','user'],labels=['Главная','Меню','Корзина','Профиль'];
document.querySelectorAll('.tabbar').forEach(bar=>{bar.innerHTML=icons.map((id,i)=>`<div class="${bar.dataset.active===['home','menu','cart','profile'][i]?'active':''}"><svg class="icon" aria-hidden="true"><use href="#${id}"/></svg><span>${labels[i]}</span></div>`).join('');});
for(const f of fonts)byId('font').add(new Option(f.name,f.id));
for(const f of numberFonts)byId('numbers').add(new Option(f.name,f.id));
byId('numbers').add(new Option('Как основной шрифт','same'),0);
byId('palettes').innerHTML=palettes.map(p=>`<button type="button" class="palette-choice" data-palette="${p.id}" aria-pressed="false"><span class="swatches" aria-hidden="true">${[p.bg,p.surface,p.ink,p.action].map(c=>`<i style="background:${c}"></i>`).join('')}</span><b>${p.name}</b><small>${p.tag}</small></button>`).join('');
byId('font-grid').innerHTML=fonts.map((f,i)=>`<button type="button" class="font-choice" data-font="${f.id}" aria-pressed="false" style="font-family:'${f.family}',system-ui,sans-serif"><span>${String(i+1).padStart(2,'0')} / ${f.name}</span><strong>Айс Латте</strong><p>Время для любимого кофе.<br>Кэшбэк и маленькие привычки.</p><div class="font-sample"><b class="sample-price">280 ₽</b><span>10 000 · 5%</span></div><small>${f.note}</small></button>`).join('');
function apply(){
 const f=fonts.find(x=>x.id===state.font),n=state.numbers==='same'?f:numberFonts.find(x=>x.id===state.numbers),p=palettes.find(x=>x.id===state.palette),weight=Math.min(state.weight,n.max);
 document.querySelectorAll('.phone').forEach(phone=>{for(const [key,value] of Object.entries({bg:p.bg,surface:p.surface,ink:p.ink,secondary:p.secondary,action:p.action,soft:p.soft,font:`'${f.family}'`,numbers:`'${n.family}'`,'number-weight':weight,'title-weight':Math.min(700,f.max),numeric:state.tabular?'tabular-nums':'proportional-nums'}))phone.style.setProperty('--'+key,String(value));});
 document.querySelectorAll('.font-choice').forEach(card=>{const sampleFont=state.numbers==='same'?fonts.find(x=>x.id===card.dataset.font):n;const sample=card.querySelector('.font-sample');sample.style.fontFamily=`'${sampleFont.family}',system-ui,sans-serif`;sample.style.fontWeight=String(Math.min(state.weight,sampleFont.max));sample.style.fontVariantNumeric=state.tabular?'tabular-nums':'proportional-nums';});
 const numberPreview=byId('number-preview');numberPreview.style.fontFamily=`'${n.family}',system-ui,sans-serif`;numberPreview.style.fontWeight=String(weight);numberPreview.style.fontVariantNumeric=state.tabular?'tabular-nums':'proportional-nums';
 byId('number-description').textContent=`Цены и бонусы: ${n.name}, жирность ${weight}. ${state.numbers==='same'?'В образцах ниже цифры следуют за шрифтом каждого образца.':'Смена текстового шрифта сохраняет этот рисунок цифр во всех образцах.'}`;
 byId('gallery-note').textContent=state.numbers==='same'?'Выбран режим «Как основной шрифт»: в каждом образце буквы и цифры из одного семейства.':`Здесь меняется только текст. Все цены ниже — ${n.name}, ${weight}, как ты выбрал. Нажми на понравившийся образец, чтобы посмотреть его на экранах.`;
 byId('font').value=state.font;byId('numbers').value=state.numbers;byId('weight').value=String(state.weight);byId('tabular').checked=state.tabular;
 document.querySelectorAll('[data-palette]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.palette===state.palette)));
 document.querySelectorAll('[data-font]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.font===state.font)));
 const choice=`${p.name} · текст: ${f.name} · цифры: ${n.name}, ${weight}${weight!==state.weight?' (доступный вес в этом образце)':''}`;
 byId('selection').textContent=choice;byId('chosen').textContent='Твой вариант: '+choice;byId('palette-note').textContent=p.note;
 try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}
}
byId('font').addEventListener('change',e=>{state.font=e.target.value;apply();});
byId('numbers').addEventListener('change',e=>{state.numbers=e.target.value;apply();});
byId('weight').addEventListener('change',e=>{state.weight=Number(e.target.value);apply();});
byId('tabular').addEventListener('change',e=>{state.tabular=e.target.checked;apply();});
byId('animate').addEventListener('change',e=>document.body.classList.toggle('moving',e.target.checked));
byId('palettes').addEventListener('click',e=>{const b=e.target.closest('[data-palette]');if(b){state.palette=b.dataset.palette;apply();}});
byId('font-grid').addEventListener('click',e=>{const b=e.target.closest('[data-font]');if(b){state.font=b.dataset.font;apply();}});
byId('baseline').addEventListener('click',()=>{state.font='system';state.numbers='same';state.weight=800;state.palette='current';state.tabular=true;apply();});
document.querySelectorAll('[data-screen]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-screen]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('[data-preview]').forEach(p=>p.classList.toggle('active',p.dataset.preview===button.dataset.screen));}));
apply();
const requiredFaces=[...new Map([...fonts,...numberFonts].filter(f=>f.id!=='system').map(f=>[f.id,f])).values()];
Promise.all(requiredFaces.map(async f=>{const faces=await document.fonts.load(`700 16px "${f.family}"`,'Айс Латте 280 ₽');if(!faces.length)throw Error(f.name);return f.name;})).then(()=>{byId('load-state').textContent='Все шрифты загружены · округлые варианты с кириллицей готовы к сравнению.';}).catch(()=>{byId('load-state').textContent='Часть шрифтов не загрузилась. Обнови страницу перед сравнением.';});
// The action dock stays outside the scrollable photo/content sample.
const productDock=document.querySelector('.sheet-footer');
document.querySelector('.product-phone').append(productDock);
